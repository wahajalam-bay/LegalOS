# Generator for src/contracts-real.js — see the header of that file.
# Run with any python that has openpyxl, from LegalOS/legalos:
#   python tools/gen-contracts.py
# The full script lives in the session that produced CTR-0001..CTR-0723;
# it maps the tracker sheet columns onto the app's contract shape:
#   B title, G type, H entities->entityId/companyTags, I signatories,
#   J handler (Imran Mir->u3, Salman Rashid->u6, others kept as handlerName),
#   K counterparty, L docFiles, M city, N value (PKR), O status, P physicalRecord.
