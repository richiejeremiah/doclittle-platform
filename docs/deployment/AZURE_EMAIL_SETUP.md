# Azure Communication Services Email Setup Guide

## Overview

Azure Communication Services Email provides a reliable, scalable email service that integrates seamlessly with your Azure infrastructure.

## Pricing

- **Free Tier**: First 50,000 emails/month free
- **Paid**: $0.0001 per email after free tier
- **Very cost-effective** for healthcare applications

## Setup Steps

### 1. Create Azure Communication Services Resource

1. Go to [Azure Portal](https://portal.azure.com)
2. Click "Create a resource"
3. Search for "Communication Services"
4. Click "Create"
5. Fill in:
   - **Resource name**: `doclittle-email` (or your choice)
   - **Subscription**: Your Azure subscription
   - **Resource Group**: Create new or use existing
   - **Location**: Choose closest to your users (e.g., `East US`)
6. Click "Review + create" → "Create"
7. Wait for deployment (1-2 minutes)

### 2. Get Connection String

1. Go to your Communication Services resource
2. Click "Keys" in the left menu
3. Copy the **Connection string** (looks like: `endpoint=https://...communication.azure.com/;accesskey=...`)
4. Save this - you'll need it for `.env`

### 3. Configure Email Domain

You have two options:

#### Option A: Azure-Managed Domain (Quick Start)

1. In your Communication Services resource, go to "Email" section
2. Click "Add domain"
3. Choose "Azure managed domain"
4. Azure will provide: `DoNotReply@azurecomm.net`
5. This works immediately - no DNS setup needed
6. **Note**: Emails come from `@azurecomm.net` domain

#### Option B: Custom Domain (Recommended for Production)

1. In "Email" section, click "Add domain"
2. Choose "Custom domain"
3. Enter your domain: `doclittle.health` (or your domain)
4. Azure will show DNS records to add:
   - **TXT record** for domain verification
   - **MX record** for email routing
5. Add these records to your domain's DNS (wherever you manage DNS)
6. Wait for verification (can take a few minutes)
7. Once verified, you can send from: `noreply@doclittle.health`

### 4. Install Azure SDK

```bash
cd middleware-platform
npm install @azure/communication-email
```

### 5. Configure Environment Variables

Add to your `.env` file:

```bash
# Azure Communication Services Email
AZURE_COMMUNICATION_CONNECTION_STRING=endpoint=https://your-resource.communication.azure.com/;accesskey=your-access-key-here
AZURE_EMAIL_SENDER=DoNotReply@azurecomm.net
# OR for custom domain:
# AZURE_EMAIL_SENDER=noreply@doclittle.health
```

### 6. Test Email Service

Restart your server and test by booking an appointment. The system will:
- Try Azure first (if configured)
- Fall back to SMTP if Azure fails
- Log to console if neither is configured

## Verification

Check server logs when sending emails:
- ✅ `📧 Email sent via Azure: [message-id]` = Success!
- ❌ `❌ Azure email send error: ...` = Check connection string

## Benefits of Azure Email

1. **Reliability**: Enterprise-grade email delivery
2. **Scalability**: Handles millions of emails
3. **Cost**: Very affordable ($0.0001/email after free tier)
4. **Integration**: Works seamlessly with other Azure services
5. **Compliance**: HIPAA-compliant infrastructure
6. **Analytics**: Track email delivery in Azure Portal

## Troubleshooting

### "Connection string invalid"
- Make sure you copied the full connection string from Azure Portal
- Check for any extra spaces or line breaks

### "Sender address not verified"
- For custom domain: Make sure DNS records are added and verified
- For Azure domain: Use `DoNotReply@azurecomm.net`

### "Email not sending"
- Check Azure Portal → Email → Monitor for delivery status
- Verify connection string is correct
- Check Azure service status

## Next Steps

1. ✅ Set up Azure Communication Services
2. ✅ Get connection string
3. ✅ Configure domain (Azure-managed or custom)
4. ✅ Add environment variables
5. ✅ Install SDK: `npm install @azure/communication-email`
6. ✅ Restart server
7. ✅ Test by booking an appointment

## Support

- [Azure Communication Services Docs](https://docs.microsoft.com/azure/communication-services/)
- [Email Service Documentation](https://docs.microsoft.com/azure/communication-services/concepts/email/email-overview)

