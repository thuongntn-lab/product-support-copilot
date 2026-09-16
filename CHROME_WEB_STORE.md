# Chrome Web Store release

## Distribution

- Visibility: **Unlisted**
- Category: **Productivity**
- Language: English (Vietnamese operating UI)

## Short description

Validate Customall cliparts and fill approved Shopify product data from live
Lark Sheets.

## Single purpose

The extension reduces repetitive upload and product-editing work for the
internal ecommerce operations team. It validates clipart folders, uploads
mockup assets, reads approved Shipping/GMC values, and fills the matching
Shopify product fields.

## Permission justifications

- `activeTab`, `tabs`, `webNavigation`: identify the current approved
  Customall or Shopify page and its active product.
- `sidePanel`: provide the operator interface beside the working page.
- `scripting`: inspect approved Customall and Shopify pages and fill the fields
  explicitly requested by the operator.
- `debugger`: issue trusted clicks for Shopify pickers implemented with
  encapsulated web components that do not respond to synthetic events.
- `storage`: retain local settings and upload history on the operator's device.
- `downloads`: export optional CSV validation reports.
- Host access: limited to Customall, Shopify Admin, and the approved internal
  lookup API.

## Data handling summary

- Reads product type, tags, product ID, filenames, and approved metafield values
  needed for the current operation.
- Sends Product Type lookup requests only to the approved internal lookup API.
- Does not sell data, use data for advertising, or transfer data to unrelated
  third parties.
- Does not collect passwords, payment data, or Shopify/Lark authentication
  cookies.
- The internal API key is used only to limit access to the team lookup service.

## Release process

1. Increase `manifest.json` version.
2. Run all tests.
3. Build a ZIP whose root contains `manifest.json`.
4. Upload the ZIP as a new package in Chrome Developer Dashboard.
5. Submit for review and publish to the existing Unlisted item.

After publication, Chrome checks for updates automatically. Remote Product Type
rules remain data-only JSON; executable JavaScript always ships inside the
reviewed extension package.
