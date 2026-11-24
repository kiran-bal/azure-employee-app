# 5. Prerequisites, Cost and Free Account

## Prerequisites

### Azure access

You need one of these:

| Option | Credit | Card needed | Who can get it |
|---|---|---|---|
| Company / L&D subscription or sandbox | Paid by the company | No | Ask L&D first – this is the best option |
| Azure free account | USD 200 for 30 days + 12 months of free services | Yes (credit or debit, not prepaid) + phone verification | One per person, new customers |
| Azure for Students | USD 100 for 12 months | No | Full-time university students with a school email |
| Pay-as-you-go | None | Yes | Anyone |

The Microsoft Learn sandbox is **not** enough – it expires after a few hours and does not allow VMs with
public IPs, private endpoints or Static Web Apps.

Role needed on the subscription: **Owner** or **Contributor**.
(Contributor is enough for everything in this project.)

### Accounts

- A Microsoft account to sign in to https://portal.azure.com
  (a personal account is easiest for a free account – company tenants sometimes block sign-up)
- A GitHub account (Static Web Apps deploys from a GitHub repository)

### Tools on your laptop

| Tool | Used for | Install (Mac) |
|---|---|---|
| Git | Pushing the code to GitHub | `xcode-select --install` |
| Python 3.10+ | Running the API locally | https://www.python.org or `brew install python` |
| Node.js 18+ | Building the React app | https://nodejs.org or `brew install node` |
| Terminal with `ssh` / `scp` | Connecting to the VM | Built into macOS |
| Azure CLI (optional) | Only for the CLI guide (`02`) | `brew install azure-cli` |
| unixODBC (optional) | Only if testing against Azure SQL from the Mac | `brew install unixodbc` |

### Things to prepare

- Your public IP (search "what is my ip") – for the SSH rule
- An email address for the Let's Encrypt certificate
- 3–5 sample employees, a few profile pictures (JPG/PNG under 5 MB), one or two PDFs

## Cost

Prices are approximate pay-as-you-go prices in USD for regions such as East US or Central India, checked
November 2026. They change by region and over time – confirm with the Azure Pricing Calculator
(https://azure.microsoft.com/pricing/calculator/) before creating resources.

| Resource | Configuration | Pay-as-you-go / month | With free account |
|---|---|---|---|
| Virtual machine | B1s or B2ats_v2 Linux (1 GB RAM) | ≈ 4.50–7.60 | Free – 750 hours/month for 12 months |
| VM OS disk | 30–64 GB SSD | ≈ 2.50–5.00 | Free – 2 × 64 GB SSD for 12 months |
| Public IP | Standard, static | ≈ 3.65 | Paid from credit |
| Azure SQL Database | Free offer (serverless) | 0 | 0 – free for the life of the subscription |
| Azure SQL Database | Basic (5 DTU), if free offer not used | ≈ 5.00 | Paid from credit |
| Private endpoint (SQL) | 1 endpoint, ≈ 0.01/hour | ≈ 7.30 | Paid from credit |
| Private DNS zone | 1 zone | ≈ 0.50 | Paid from credit |
| Storage account | Standard LRS, Hot, a few MB | < 0.10 | Free – 5 GB for 12 months |
| Static Web Apps | Free plan | 0 | 0 |
| VNet, subnets, NSG | | 0 | 0 |
| Outbound data | First 100 GB/month | 0 | 0 |
| **Total** | | **≈ 21–27** | **≈ 11–12 taken from the credit** |

For a typical evaluation (resources running 1–2 weeks) the real cost is about **USD 3–6**.

### Ways to keep cost down

- Use the Azure SQL Database **free offer** instead of Basic.
- **Stop** the VM from the portal when not in use. "Stopped (deallocated)" means no compute charge; the
  disk and public IP are still charged.
- Skip the private endpoint (≈ 7.30/month) if the evaluator only needs it explained. Use a SQL firewall rule
  for the VM's IP instead and explain Private Endpoint in the review.
- Create a **budget** with an email alert: Portal → Cost Management → Budgets → + Add, amount USD 10.
- **Delete the resource group** as soon as the evaluation is done.

## Does the free account cover this project?

**Yes, fully**, as long as it is done within the first 30 days.

- Every service used is available on the free account.
- The VM (B1s or B2ats_v2), disks, storage and SQL Database free offer cost nothing.
- The private endpoint, public IP and private DNS zone (≈ USD 11–12/month together) are paid from the USD 200
  credit – a small part of it.
- The free account has a spending limit, so your card is **not charged** while it lasts.

Things to be aware of:

1. **After 30 days or when the credit runs out**, the subscription is disabled and resources stop, unless you
   upgrade to pay-as-you-go. If the evaluation could be after day 30, upgrade before then. After upgrading,
   the 12-month free services stay free; you pay only for what is outside the free amounts (≈ USD 11–12/month
   for this project).
2. **Pick a free-account VM size**: B1s, B2ats_v2 (AMD) or B2pts_v2 (Arm). Other sizes are not free.
   In Central India B1s was not offered to this subscription, so B2ats_v2 was used.
3. **Use the SQL free offer exactly as described** in the portal guide (the "Apply offer" banner). When the
   monthly free compute is used up, the database pauses until next month instead of charging.
4. The free account has a low vCPU quota (around 4 vCPUs per region). This project needs only 1.
5. Some regions do not offer every service. Keep everything in one region that has all of them.
6. One free account per person. If you already used one before, use Azure for Students or pay-as-you-go
   (≈ USD 3–6 for the evaluation period).

### Azure for Students

Also covers this project. The USD 100 credit is more than enough. It has the same "disabled when credit runs
out" behaviour, and the free VM sizes, storage and SQL free amounts also apply.

### Showing the work to the evaluator

If you use your own account, the evaluator cannot see your resources. Either:

- share screenshots and a live demo, or
- give the evaluator read access: resource group → Access control (IAM) → + Add role assignment → **Reader**
  → select their email (they must have a Microsoft account).
