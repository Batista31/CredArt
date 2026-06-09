# CredArt

CredArt is building a structured credit-card catalogue for rewards discovery.
Phase 2 is limited to scraping public HDFC card pages and producing clean JSON
for future ingestion.

## Repository Structure

```text
CredArt/
|-- backend/
|   |-- scraper/
|   |   |-- scrape_cards.py
|   |   |-- parser.py
|   |   |-- utils.py
|   |   |-- outputs/
|   |   |   |-- hdfc_catalogue.json
|   |   |   `-- transfer_partners.json
|   |   `-- raw/
|   |       `-- html/
|   |           `-- infinia.html
|   `-- requirements.txt
|-- db/
|   |-- prisma/
|   |   |-- migrations/
|   |   `-- schema.prisma
|   |-- package.json
|   `-- .env.example
|-- .gitignore
`-- README.md
```

The repository intentionally has two implementation folders:

- `backend`: scraper code, raw snapshots, and normalized scraper outputs.
- `db`: existing Prisma schema and migrations. The scraper does not write to it.

## Scraper Flow

1. `scrape_cards.py` fetches the official public HDFC Infinia page.
2. The response is saved to `backend/scraper/raw/html/infinia.html` for
   debugging and reproducibility.
3. `parser.py` uses BeautifulSoup and factual text patterns to extract the
   required fields.
4. `utils.py` writes the normalized record to
   `backend/scraper/outputs/hdfc_catalogue.json`.

`reward_rate` is represented as reward points earned per INR 100 spent. A field
is saved as `null` when the source page does not explicitly state it.

## Run the Scraper

```powershell
cd backend
python -m pip install -r requirements.txt
python scraper/scrape_cards.py
```

Expected normalized fields:

```json
{
  "card_name": "INFINIA Metal Edition",
  "bank_name": "HDFC Bank",
  "annual_fee": 12500,
  "network": null,
  "reward_rate": 3.33,
  "source_url": "https://www.hdfc.bank.in/credit-cards/infinia-credit-card"
}
```

## Current Scope

This phase does not implement FastAPI, AI integrations, embeddings, vector
search, MCP tools, or database writes.
