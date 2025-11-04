/**
 * PAYMENT PAGE JAVASCRIPT
 * Handles Stripe payment processing
 * 
 * Flow:
 * 1. Extract token from URL
 * 2. Load checkout details from middleware
 * 3. Initialize Stripe Elements
 * 4. Process payment
 * 5. Complete checkout on success
 */

// Get payment token from URL
const urlParams = new URLSearchParams(window.location.search);
const pathSegments = window.location.pathname.split('/');
const paymentToken = pathSegments[pathSegments.length - 1];

let stripe;
let elements;
let cardElement;
let checkoutData;

/**
 * Initialize on page load
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Payment page loaded, token:', paymentToken);

    if (!paymentToken || paymentToken === 'payment') {
        showError('Invalid payment link');
        return;
    }

    await loadCheckoutDetails();
});

/**
 * Load checkout details from middleware
 */
async function loadCheckoutDetails() {
    try {
        const response = await fetch(`/api/payment/checkout/${paymentToken}`);
        const data = await response.json();

        if (!data.success) {
            showError(data.error || 'Failed to load checkout details');
            return;
        }

        checkoutData = data.checkout;

        // Display order details
        displayOrderDetails(checkoutData);

        // Initialize Stripe
        await initializeStripe(data.stripe_publishable_key);

        // Show payment form
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('paymentForm').style.display = 'block';

    } catch (error) {
        console.error('Error loading checkout:', error);
        showError('Failed to load payment page');
    }
}

/**
 * Display order details in the UI
 */
function displayOrderDetails(checkout) {
    document.getElementById('merchantName').textContent = checkout.merchant_name;
    document.getElementById('productName').textContent = checkout.product_name;
    document.getElementById('quantity').textContent = checkout.quantity || 1;
    document.getElementById('itemPrice').textContent = `$${checkout.amount.toFixed(2)}`;
    document.getElementById('totalAmount').textContent = `$${checkout.amount.toFixed(2)}`;
    document.getElementById('button-amount').textContent = `$${checkout.amount.toFixed(2)}`;
}

/**
 * Initialize Stripe and create card element
 */
async function initializeStripe(publishableKey) {
    // Initialize Stripe
    stripe = Stripe(publishableKey);

    // Create Elements instance
    elements = stripe.elements();

    // Create card element with styling
    cardElement = elements.create('card', {
        style: {
            base: {
                fontSize: '16px',
                color: '#32325d',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                '::placeholder': {
                    color: '#a0aec0'
                }
            },
            invalid: {
                color: '#e53e3e',
                iconColor: '#e53e3e'
            }
        }
    });

    // Mount card element
    cardElement.mount('#card-element');

    // Handle real-time validation errors
    cardElement.on('change', (event) => {
        const displayError = document.getElementById('card-errors');
        if (event.error) {
            displayError.textContent = event.error.message;
        } else {
            displayError.textContent = '';
        }
    });

    // Handle form submission
    const form = document.getElementById('payment-form');
    form.addEventListener('submit', handleSubmit);
}

/**
 * Handle payment form submission
 */
async function handleSubmit(event) {
    event.preventDefault();

    // Disable submit button
    setLoading(true);

    try {
        // Create payment method with Stripe
        const { error, paymentMethod } = await stripe.createPaymentMethod({
            type: 'card',
            card: cardElement,
            billing_details: {
                name: checkoutData.customer_name,
                email: checkoutData.customer_email,
                phone: checkoutData.customer_phone
            }
        });

        if (error) {
            // Show error to customer
            showCardError(error.message);
            setLoading(false);
            return;
        }

        // Send payment method to backend
        await processPayment(paymentMethod.id);

    } catch (error) {
        console.error('Payment error:', error);
        showCardError('Payment failed. Please try again.');
        setLoading(false);
    }
}

/**
 * Process payment on backend
 */
async function processPayment(paymentMethodId) {
    try {
        // Call middleware to process payment
        const response = await fetch('/api/payment/process', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                payment_token: paymentToken,
                payment_method_id: paymentMethodId,
                amount: Math.round(checkoutData.amount * 100), // Convert to cents
                currency: 'usd'
            })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Payment processing failed');
        }

        // Handle payment intent status
        if (data.requires_action) {
            // Handle 3D Secure or other authentication
            const { error: confirmError } = await stripe.confirmCardPayment(
                data.client_secret
            );

            if (confirmError) {
                throw new Error(confirmError.message);
            }
        }

        // Payment successful
        await completeCheckout(data.payment_intent_id);

    } catch (error) {
        console.error('Payment processing error:', error);
        throw error;
    }
}

/**
 * Complete checkout after successful payment
 */
async function completeCheckout(paymentIntentId) {
    try {
        const response = await fetch(`/voice/checkout/complete/${checkoutData.id}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                payment_intent_id: paymentIntentId
            })
        });

        const data = await response.json();

        if (data.success) {
            showSuccess(data.order_id);
        } else {
            throw new Error('Checkout completion failed');
        }

    } catch (error) {
        console.error('Checkout completion error:', error);
        // Payment went through but order creation failed
        // In production, this should trigger an alert to support
        showSuccess('PENDING');
    }
}

/**
 * Show success state
 */
function showSuccess(orderId) {
    document.getElementById('paymentForm').style.display = 'none';
    document.getElementById('successState').style.display = 'block';
    document.getElementById('orderId').textContent = orderId;
}

/**
 * Show error state
 */
function showError(message) {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('errorState').style.display = 'block';
    document.getElementById('errorMessage').textContent = message;
}

/**
 * Show card error
 */
function showCardError(message) {
    const displayError = document.getElementById('card-errors');
    displayError.textContent = message;
}

/**
 * Set loading state on submit button
 */
function setLoading(isLoading) {
    const button = document.getElementById('submit-button');
    const buttonText = document.getElementById('button-text');
    const buttonSpinner = document.getElementById('button-spinner');

    button.disabled = isLoading;

    if (isLoading) {
        buttonText.style.display = 'none';
        buttonSpinner.style.display = 'inline-block';
    } else {
        buttonText.style.display = 'inline';
        buttonSpinner.style.display = 'none';
    }
}