# Azure Communication Services - Custom Domain Setup (Production)

## Quick Setup Guide for Custom Domain

### Prerequisites
- Azure account with Communication Services resource created
- Domain name you control (e.g., `doclittle.health`, `doclittle.com`)
- Access to your domain's DNS management

---

## Step-by-Step Setup

### 1. Create Azure Communication Services Resource

1. Go to [Azure Portal](https://portal.azure.com)
2. **Create a resource** → Search "Communication Services"
3. Click **Create**
4. Fill in:
   - **Name**: `doclittle-email` (or your choice)
   - **Subscription**: Your subscription
   - **Resource Group**: Create new or use existing
   - **Location**: Choose closest to users (e.g., `East US`, `West US 2`)
5. Click **Review + create** → **Create**
6. Wait 1-2 minutes for deployment

### 2. Get Connection String

1. Open your Communication Services resource
2. Go to **Keys** (left sidebar)
3. Copy the **Connection string** (full string starting with `endpoint=https://...`)
4. **Save this securely** - you'll add it to `.env`

### 3. Add Custom Domain

1. In your Communication Services resource, go to **Email** section
2. Click **+ Add domain**
3. Select **Custom domain**
4. Enter your domain: `doclittle.health` (or your domain)
5. Click **Add**

### 4. Configure DNS Records

Azure will show you **exactly which DNS records to add**. You'll need:

#### Record 1: Domain Verification (TXT)
- **Type**: TXT
- **Name**: `@` (or root domain)
- **Value**: `azure-verify=xxxxxxxxxxxxx` (Azure provides this)
- **TTL**: 3600 (or default)

#### Record 2: Email Routing (MX)
- **Type**: MX
- **Name**: `@` (or root domain)
- **Value**: `xxxxxxxxxxxxx.mail.protection.outlook.com` (Azure provides this)
- **Priority**: 0 (or value Azure provides)
- **TTL**: 3600 (or default)

#### Record 3: SPF (TXT) - Optional but Recommended
- **Type**: TXT
- **Name**: `@`
- **Value**: `v=spf1 include:spf.protection.outlook.com -all`
- **TTL**: 3600

#### Record 4: DKIM (CNAME) - Optional but Recommended
Azure will provide 2 CNAME records for DKIM:
- **Type**: CNAME
- **Name**: `selector1._domainkey` (Azure provides exact name)
- **Value**: `selector1-doclittle-com._domainkey.xxxxxxxxxxxxx.onmicrosoft.com`
- **TTL**: 3600

- **Type**: CNAME
- **Name**: `selector2._domainkey` (Azure provides exact name)
- **Value**: `selector2-doclittle-com._domainkey.xxxxxxxxxxxxx.onmicrosoft.com`
- **TTL**: 3600

### 5. Add DNS Records to Your Domain

**Where to add DNS records:**
- **GoDaddy**: DNS Management → Records
- **Namecheap**: Advanced DNS
- **Cloudflare**: DNS → Records
- **AWS Route 53**: Hosted Zones → Your domain
- **Google Domains**: DNS → Custom records

**Important:**
- Add ALL records Azure shows you
- Wait 5-15 minutes for DNS propagation
- Don't skip SPF/DKIM - they improve deliverability

### 6. Verify Domain in Azure

1. Go back to Azure Portal → Your Communication Services → Email
2. Find your domain in the list
3. Click **Verify** (or it auto-verifies)
4. Wait for status to show **Verified** ✅

**If verification fails:**
- Check DNS records are correct
- Wait longer (DNS can take up to 48 hours, usually 15-30 minutes)
- Use `nslookup` or `dig` to verify records are live

### 7. Configure Sender Address

Once verified, you can send from any email address on your domain:
- `noreply@doclittle.health`
- `appointments@doclittle.health`
- `support@doclittle.health`
- etc.

**Best Practice**: Use `noreply@yourdomain.com` for automated emails

### 8. Install Azure SDK

```bash
cd middleware-platform
npm install @azure/communication-email
```

### 9. Add to `.env` File

```bash
# Azure Communication Services Email
AZURE_COMMUNICATION_CONNECTION_STRING=endpoint=https://your-resource.communication.azure.com/;accesskey=your-access-key-here
AZURE_EMAIL_SENDER=noreply@doclittle.health
```

**Replace:**
- `your-resource` with your actual resource name
- `your-access-key-here` with your actual access key
- `doclittle.health` with your actual domain

### 10. Restart Server

```bash
npm start
```

### 11. Test Email

Book an appointment or trigger any email. Check logs:
- ✅ `📧 Email sent via Azure: [message-id]` = Success!
- Check recipient's inbox (and spam folder)

---

## DNS Record Examples

### Example for `doclittle.health`:

```
Type    Name                    Value
----    ----                    -----
TXT     @                       azure-verify=abc123xyz789
MX      @                       0 xyz.mail.protection.outlook.com
TXT     @                       v=spf1 include:spf.protection.outlook.com -all
CNAME   selector1._domainkey    selector1-doclittle-health._domainkey.xyz.onmicrosoft.com
CNAME   selector2._domainkey    selector2-doclittle-health._domainkey.xyz.onmicrosoft.com
```

---

## Verification Commands

### Check DNS Records (Terminal)

```bash
# Check TXT record
dig TXT doclittle.health

# Check MX record
dig MX doclittle.health

# Check CNAME records
dig CNAME selector1._domainkey.doclittle.health
dig CNAME selector2._domainkey.doclittle.health
```

### Online DNS Checkers

- https://mxtoolbox.com/
- https://dnschecker.org/
- https://www.whatsmydns.net/

---

## Troubleshooting

### Domain Not Verifying

1. **Check DNS propagation**: Use DNS checker tools above
2. **Verify record values**: Copy-paste exact values from Azure
3. **Wait longer**: DNS can take up to 48 hours (usually 15-30 min)
4. **Check TTL**: Lower TTL (300-600) for faster updates

### Emails Not Sending

1. **Check connection string**: Must be full string from Azure Portal
2. **Verify sender address**: Must match your verified domain
3. **Check Azure Portal**: Email → Monitor for delivery status
4. **Check spam folder**: First emails might go to spam

### Emails Going to Spam

1. **Add SPF record**: `v=spf1 include:spf.protection.outlook.com -all`
2. **Add DKIM records**: Both selector1 and selector2
3. **Warm up domain**: Send test emails to yourself first
4. **Use proper sender name**: "DocLittle" not just email address

---

## Production Best Practices

1. ✅ **Use dedicated subdomain**: `mail.doclittle.health` (optional but recommended)
2. ✅ **Set up SPF, DKIM, DMARC**: Improves deliverability
3. ✅ **Monitor email delivery**: Azure Portal → Email → Monitor
4. ✅ **Use consistent sender**: `noreply@doclittle.health` for all automated emails
5. ✅ **Test before going live**: Send test emails to multiple providers (Gmail, Outlook, etc.)

---

## Cost

- **Free**: First 50,000 emails/month
- **Paid**: $0.0001 per email after free tier
- **Example**: 100,000 emails/month = $5/month

---

## Support

- [Azure Communication Services Docs](https://docs.microsoft.com/azure/communication-services/)
- [Email Service Documentation](https://docs.microsoft.com/azure/communication-services/concepts/email/email-overview)
- [DNS Configuration Guide](https://docs.microsoft.com/azure/communication-services/concepts/email/email-domain-verification)

---

## Next Steps After Setup

1. ✅ Test email delivery
2. ✅ Monitor first few emails in Azure Portal
3. ✅ Check spam scores (use mail-tester.com)
4. ✅ Set up email monitoring/alerts
5. ✅ Document your sender addresses

