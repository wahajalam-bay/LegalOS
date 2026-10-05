# Spend document access review

**Admin-only.** This document lists documents a Compliance user currently cannot see, including their
names and locations. It is written for whoever decides the sharing policy, not for the Compliance
register, and nothing in the application was changed to produce it.

Generated 2026-09-22 18:36 · no document scope was modified.

## Why this exists

The Compliance spend trackers and the Commercial contracts register are built from the **same source
rows**, so all 199 spend agreements are registered in both modules. When document scope was first
recorded, only Commercial cited them, so that is the scope they carry. A Compliance user therefore sees
the lease or service record and cannot open most of its documents.

This predates the Compliance reconciliation and was not caused by it: the 32 records whose trackers are
misfiled show the same access pattern as the 167 correctly filed ones. The scope diff is 0 widened,
0 narrowed, 0 unscoped.

## The numbers

| | |
|---|---|
| Distinct spend documents | **321** |
| Record-document links | 323 (2 document(s) attached to two records) |
| Readable by Compliance | **311** |
| Not readable by Compliance | **10** |
| Readable by Commercial | 305 |
| Readable by neither | 0 |
| Would change if the recommendation is accepted | 0 |

## Recommendation categories

| Category | Documents |
|---|---|
| C_SHARED_COMMERCIAL_COMPLIANCE | 297 |
| A_COMPLIANCE_SHOULD_READ | 16 |
| B_COMMERCIAL_ONLY | 5 |
| D_HISTORICAL_SOURCE_ONLY | 5 |

## Operational impact, per record

| Family | Records | All docs visible | Some hidden | None visible | No docs linked | Linked | Visible | Hidden |
|---|---|---|---|---|---|---|---|---|
| Lease | 102 | 95 | 2 | 2 | 3 | 212 | 208 | 4 |
| Service Agreement | 83 | 62 | 1 | 4 | 16 | 100 | 94 | 6 |
| Other Spend | 14 | 8 | 0 | 0 | 6 | 11 | 11 | 0 |

## If the business decides to share

The change is `sharedGroups += "compliance"` on the selected documents, carrying `reason`, `approvedBy`
and `approvedAt`. `allowedGroups` is **not** rewritten: the document stays Commercial-origin and becomes
explicitly shared, so the source-root ownership that the whole scope model rests on is left intact.
A rule-based migration (record family is Lease or Service Agreement) is preferable to editing 323
files by hand, and must be followed by a scope diff showing only the intended documents widened,
with no Litigation, requester or unrelated-entity exposure.

## Every document

| # | Document | Record | Family | Entity | Counterparty | Type | allowed | shared | denied | Compl. | Comm. | Recommendation |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Lease Agreement_Munawar Husain_2nd floor head office_20210 | CTR-1FYJTOT | Lease | Dubizzle Labs (SMC-Private | Munawar Hussain Malik | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 2 | First Amendment Tenancy Agreement 2nd Floor Pearl One_Muna | CTR-1FYJTOT | Lease | Dubizzle Labs (SMC-Private | Munawar Hussain Malik | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 3 | Second AMendment 2nd Floor Peral One 4000sq.ft. Dubizzle L | CTR-1FYJTOT | Lease | Dubizzle Labs (SMC-Private | Munawar Hussain Malik | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 4 | Third Amendment_Second Floor_4000 sq ft_Munawar Hussain _2 | CTR-1FYJTOT | Lease | Dubizzle Labs (SMC-Private | Munawar Hussain Malik | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 5 | LeaseAgreementMegatower3rdfloor_NaveedShah_EMPGLabs_202110 | CTR-1FYJTOU | Lease | Dubizzle Labs (SMC-Private | Naveed Shah | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 6 | First Amendment 3 Floor MTL EMPG_1 (1).pdf | CTR-1FYJTOU | Lease | Dubizzle Labs (SMC-Private | Naveed Shah | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 7 | Second Amendment Third Floor Mega Tower (1).pdf | CTR-1FYJTOU | Lease | Dubizzle Labs (SMC-Private | Naveed Shah | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 8 | LeaseAgreementMegatower6thFloor_EMPGLABS_20211025 (1).pdf | CTR-1FYJTOV | Lease | Dubizzle Labs (SMC-Private | Naveed Shah | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 9 | First Amendment 6th Floor Mega Tower (1).pdf | CTR-1FYJTOV | Lease | Dubizzle Labs (SMC-Private | Naveed Shah | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 10 | LeaseAgreementMegaTower8thfloor_Naveedshah_EMPGLabs_202109 | CTR-1FYJTOW | Lease | Dubizzle Labs (SMC-Private | Naveed Shah | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 11 | First Amendment 8th FLoor Mega Tower (1).pdf | CTR-1FYJTOW | Lease | Dubizzle Labs (SMC-Private | Naveed Shah | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 12 | LeaseAgreement_ReshmatexLimited_EMPGLabs_20210710_ (1).pdf | CTR-1FYJTOX | Lease | Dubizzle Labs (SMC-Private | Naveed Shah | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 13 | TenanacyAgreement_EMPG Labs_Feroz ALi_20210630 (1).pdf | CTR-1C2LCUK | Lease | Dubizzle Labs (SMC-Private | Feroz Ali | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 14 | TenanacyAgreement_EMPG Labs_Feroz ALi_20210630.pdf | CTR-1C2LCUK | Lease | Dubizzle Labs (SMC-Private | Feroz Ali | RECORD_DOCUMENT | compliance | — | — | yes | no | A_COMPLIANCE_SHOULD_READ |
| 15 | TenanacyAgreement_EMPG Labs_Zulfiqar Ali_20210630. (1).pdf | CTR-1C2LCUL | Lease | Dubizzle Labs (SMC-Private | Zulfiqar Ali | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 16 | TenanacyAgreement_EMPG Labs_Zulfiqar Ali_20210630..pdf | CTR-1C2LCUL | Lease | Dubizzle Labs (SMC-Private | Zulfiqar Ali | RECORD_DOCUMENT | compliance | — | — | yes | no | A_COMPLIANCE_SHOULD_READ |
| 17 | Lease Agreeemnt EMPG Labs Karachi Office (1).pdf | CTR-1C2LCUM | Lease | Dubizzle Labs (SMC-Private | Kumail Younas | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 18 | Novation Agreement EMPG Labs Karachi office (1).pdf | CTR-1C2LCUM | Lease | Dubizzle Labs (SMC-Private | Kumail Younas | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 19 | Lease Agreement_Dubizzle_Labs_Farooq Associates_0001 (1).p | CTR-1C2LCUO | Lease | Dubizzle Labs (Private) Li | Farooq Associates | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 20 | Lease Agreement_Dubizzle_Labs_Farooq Associates_0001.pdf | CTR-1C2LCUO | Lease | Dubizzle Labs (Private) Li | Farooq Associates | RECORD_DOCUMENT | compliance | — | — | yes | no | A_COMPLIANCE_SHOULD_READ |
| 21 | Lease Agreement_Dubizzle_Labs Second floor Naveed Shah_000 | CTR-1C2LCVB | Lease | Dubizzle Labs (Private) Li | Naveed Shah | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 22 | 1812_001.00STH-LA20190107-LeaseAgreement-Nazimabadoffice-p | CTR-0T5MGEA | Lease | Zameen Media (Private) Lim | Muhammad Fawad Sheikh, She | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 23 | First Addendum Nazimabad Office (1).pdf | CTR-0T5MGEA | Lease | Zameen Media (Private) Lim | Muhammad Fawad Sheikh, She | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 24 | Novation & Renewal of NN 25 to 27_1 (3).pdf | CTR-0T5MGEA | Lease | Zameen Media (Private) Lim | Muhammad Fawad Sheikh, She | RENEWAL_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 25 | 99.2_First Addendum Nazimabad Office.pdf | CTR-0T5MGEA | Lease | Zameen Media (Private) Lim | Muhammad Fawad Sheikh, She | ACTION_DOCUMENT | compliance | — | — | yes | no | A_COMPLIANCE_SHOULD_READ |
| 26 | Lease Agreemnet_Zameen Developments and Naveed Shah_202101 | CTR-1AVF7HG | Lease | Zameen Developments (Priva | Naveed Shah | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 27 | First Amendment GF Mega Tower Zameen Developments (1).pdf | CTR-1AVF7HG | Lease | Zameen Developments (Priva | Naveed Shah | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 28 | Second Amendment GF Mega Tower Zameen Developments (1).pdf | CTR-1AVF7HG | Lease | Zameen Developments (Priva | Naveed Shah | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 29 | Second Amendment GF ZD MTL_1 (1).pdf | CTR-1AVF7HG | Lease | Zameen Developments (Priva | Naveed Shah | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 30 | Third Amendment Lease Agreement (Naveed Shah & Zameen Deve | CTR-1AVF7HG | Lease | Zameen Developments (Priva | Naveed Shah | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 31 | First Amendment to Maintenance Services Agreement (Naveed  | CTR-1AVF7HG | Lease | Zameen Developments (Priva | Naveed Shah | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 32 | Lease Agreement - Rawalpindi MALL 35-GF,FF SF (1).pdf | CTR-0WFUCFR | Lease | Zameen Developments (Priva | Zaheer IqbaI | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 33 | First Amendment Mall 35 Resi 24 to 25_1 (1).pdf | CTR-0WFUCFR | Lease | Zameen Developments (Priva | Zaheer IqbaI | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 34 | RO-RWP1stFloor (1).pdf | CTR-10EG489 | Lease | Zameen Media (Private) Lim | Tahir Aziz | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 35 | First Amendment Rwp 1st Floor (1).pdf | CTR-10EG489 | Lease | Zameen Media (Private) Lim | Tahir Aziz | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 36 | Vehicle lease financing agreement- Adil Masud.pdf | CTR-10EG48C | Lease | Zameen Media (Private) Lim | Adil Masud | (not in compliance root) | commercial | — | — | no | yes | B_COMMERCIAL_ONLY |
| 37 | Settlementagreement_ZameenMediaandArbabetc_20201124.pdf | CTR-10EG48D | Lease | Zameen Media (Private) Lim | Sahibzada Ali Akbar Abbasi | (not in compliance root) | commercial | — | — | no | yes | B_COMMERCIAL_ONLY |
| 38 | 1902_001.00CTL-LA 20190204 Lahore Center- lease agreement- | CTR-1QZ6TFU | Lease | Zameen Media (Private) Lim | Javed Arshad Bhatti, Mian  | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 39 | First Amendment 4th Floor Lahore Center_202203311 (1).pdf | CTR-1QZ6TFU | Lease | Zameen Media (Private) Lim | Javed Arshad Bhatti, Mian  | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 40 | 1812_002.00CTL-LA 20181214-Lahore Center- lease agreement- | CTR-1QZ6TFV | Lease | Zameen Media (Private) Lim | Niamat Saleem Trust: Sohai | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 41 | First Amendment to Lease Agreement_Zameen Media and Naimat | CTR-1QZ6TFV | Lease | Zameen Media (Private) Lim | Niamat Saleem Trust: Sohai | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 42 | LC Second Amendment Third Floor_1 (1).pdf | CTR-1QZ6TFV | Lease | Zameen Media (Private) Lim | Niamat Saleem Trust: Sohai | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 43 | Lahore Centre (5th Floor) Lease Agreement (1).pdf | CTR-1QZ6TFW | Lease | Zameen Media (Private) Lim | Javed Arsahd Bhatti, Mian  | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 44 | 102 - Lahore Centre (5th Floor) Lease Agreement Supporting | CTR-1QZ6TFW | Lease | Zameen Media (Private) Lim | Javed Arsahd Bhatti, Mian  | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 45 | 1806_001.00CTL-LA 20180625- Mega Tower Lease Agreement-OLD | CTR-1QZ6TFX | Lease | Zameen Media (Private) Lim | Naveed Shah | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 46 | POA Mega Tower (1).pdf | CTR-1QZ6TFX | Lease | Zameen Media (Private) Lim | Naveed Shah | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 47 | 104 - 1907_002.01CTL-LA 20160816 - MOU Supporting Document | CTR-1QZ6TFX | Lease | Zameen Media (Private) Lim | Naveed Shah | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 48 | 1907_002.01CTL-LA 20160816- First Amendment to Lease agree | CTR-1QZ6TFX | Lease | Zameen Media (Private) Lim | Naveed Shah | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 49 | 104.1 - 1907_002.01CTL-LA 20160816- Second Amendment to Le | CTR-1QZ6TFX | Lease | Zameen Media (Private) Lim | Naveed Shah | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 50 | Dec2016 Pearl One-1st Floor-Zameen-(old) (2).pdf | CTR-1QZ6TFY | Lease | Zameen Media (Private) Lim | Munawar Hussain Malik | HISTORICAL_DOCUMENT | commercial | — | — | no | yes | D_HISTORICAL_SOURCE_ONLY |
| 51 | signatory authority- ZAK- Pearl One Zameen 1st Floor (1).p | CTR-1QZ6TFY | Lease | Zameen Media (Private) Lim | Munawar Hussain Malik | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 52 | 106.1 - Dec 2016 Pearl One-1st Floor-First Amendment-Zamee | CTR-1QZ6TFY | Lease | Zameen Media (Private) Lim | Munawar Hussain Malik | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 53 | Second Amendment of Tenancy Agreement 1st Floor Pearl One_ | CTR-1QZ6TFY | Lease | Zameen Media (Private) Lim | Munawar Hussain Malik | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 54 | Third Amendment 1st Floor Pearl One 6718 sq.ft. (1).pdf | CTR-1QZ6TFY | Lease | Zameen Media (Private) Lim | Munawar Hussain Malik | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 55 | Forth Amendment_First Floor_6718 sqft_Munawaer Hussain_Hea | CTR-1QZ6TFY | Lease | Zameen Media (Private) Lim | Munawar Hussain Malik | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 56 | Nov2015PearlOne-2nd3rd-Zameen-old (1).pdf | CTR-1QZ6TFZ | Lease | Zameen Media (Private) Lim | Munawar Hussain Malik | HISTORICAL_DOCUMENT | commercial | — | — | no | yes | D_HISTORICAL_SOURCE_ONLY |
| 57 | signatoryauthority-ZAK-PearlOne 2nd 3rd Floor (1).pdf | CTR-1QZ6TFZ | Lease | Zameen Media (Private) Lim | Munawar Hussain Malik | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 58 | 108.1-Nov2015PearlOne-2nd3rdFloor-FirstAmendment-Zameen (1 | CTR-1QZ6TFZ | Lease | Zameen Media (Private) Lim | Munawar Hussain Malik | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 59 | TenanacyagreementMunawarHussain2nd3rd_20220830 (1).pdf | CTR-1QZ6TFZ | Lease | Zameen Media (Private) Lim | Munawar Hussain Malik | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 60 | Third Amendment 2nd and 3rd Floor Peral One (1).pdf | CTR-1QZ6TFZ | Lease | Zameen Media (Private) Lim | Munawar Hussain Malik | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 61 | Fourth Amendment_second and third floor_Head Office_13803  | CTR-1QZ6TFZ | Lease | Zameen Media (Private) Lim | Munawar Hussain Malik | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 62 | 20190208 INT-ZAMEEN LEASE AGREEMENT PEARL ONE 1ST FLOOR-[R | CTR-1QZ6TG0 | Lease | Zameen Media (Private) Lim | ZMZMPL | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 63 | signatory authority- ZAK- Pearl One first Floor 2500 sqft  | CTR-1QZ6TG0 | Lease | Zameen Media (Private) Lim | ZMZMPL | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 64 | First Amendment first Floor Pearl One 2500 sqft (1).pdf | CTR-1QZ6TG0 | Lease | Zameen Media (Private) Lim | ZMZMPL | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 65 | Second Amendment First Floor Pearl One 2500 sft (1).pdf | CTR-1QZ6TG0 | Lease | Zameen Media (Private) Lim | ZMZMPL | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 66 | Third Amendment First Floor Pearl One 2500 sqft (1).pdf | CTR-1QZ6TG0 | Lease | Zameen Media (Private) Lim | ZMZMPL | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 67 | 20190627LeaseAgreement-Quetta (1).pdf | CTR-1QZ6TG1 | Lease | Zameen Media (Private) Lim | Ejaz Dogar | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 68 | 20180704SGH-LeaseAgreementExecutedver. (1).pdf | CTR-1QZ6TG2 | Lease | Zameen Media (Private) Lim | Malik Mahboob Aziz | EXECUTED_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 69 | TerminationOfSGDAgreement_1 (1).PDF | CTR-1QZ6TG2 | Lease | Zameen Media (Private) Lim | Malik Mahboob Aziz | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 70 | LeaseAgreementforSahiwalOffice (1).pdf | CTR-1QZ6TGR | Lease | Zameen Media (Private) Lim | Chaudhary Amjad Rasheed, S | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 71 | 1903_006.00CTL-LeaseAgreementMultanOffice3rdFloor (1).pdf | CTR-1QZ6TGY | Lease | Zameen Media (Private) Lim | Syed Zulkifal Akbar Gardez | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 72 | 1903_006.00CTL-Lease Agreement Multan Office 3rd Floor (92 | CTR-1QZ6THK | Lease | Zameen Media (Private) Lim | Syed Daniyal Hussain Garde | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 73 | 1903_006.00CTL-Lease Agreement Multan Office 3rd Floor (93 | CTR-1QZ6THL | Lease | Zameen Media (Private) Lim | Nasreen Shahnaz Gardezi | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 74 | 1903_006.00CTL-Lease Agreement Multan Office 3rd Floor (93 | CTR-1QZ6THM | Lease | Zameen Media (Private) Lim | Syed Ali Hasnain Gardezi | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 75 | 1912_002.00CTL-Lease Agreement 4 Marla DHA Lahore (1).pdf | CTR-1QZ6THN | Lease | Zameen Media (Private) Lim | Razia Nazir | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 76 | AK Tower, Gujranwala (1).pdf | CTR-1QZ6THO | Lease | Zameen Media (Private) Lim | Hafiz Muhammad Maqsood | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 77 | 1902_006.00CTL-LA Warehouse Peco Road Lahore (1).pdf | CTR-1QZ6THQ | Lease | Zameen Media (Private) Lim | Muhammad Ilyas Khan | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 78 | First Amendment WHS PRL 2024_1 (1).pdf | CTR-1QZ6THQ | Lease | Zameen Media (Private) Lim | Muhammad Ilyas Khan | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 79 | 1807_018.00CTL-LABahawalpurOffice (1).pdf | CTR-1QZ6THR | Lease | Zameen Media (Private) Lim | Tariq Shahzad | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 80 | 1807_018.00CTL-LABahawalpurOfficeTerminationAgreement (1). | CTR-1QZ6THR | Lease | Zameen Media (Private) Lim | Tariq Shahzad | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 81 | Lease Agreement for Fasilabad Office 1st floor (1).pdf | CTR-1QZ6THS | Lease | Zameen Media (Private) Lim | Jawed Iqbal | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 82 | 1701_010.00CTL-LA Mezzanine Faisalabad First Amendment (1) | CTR-1QZ6THS | Lease | Zameen Media (Private) Lim | Jawed Iqbal | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 83 | Second Amendment_Zameen Media and Jawed Iqbal_20201026_000 | CTR-1QZ6THS | Lease | Zameen Media (Private) Lim | Jawed Iqbal | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 84 | Third Amendment Lease Agreement_jawed Iqbal_Zameen Media_2 | CTR-1QZ6THS | Lease | Zameen Media (Private) Lim | Jawed Iqbal | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 85 | Fourth Amendment_Fsd Office First Floor (1).pdf | CTR-1QZ6THS | Lease | Zameen Media (Private) Lim | Jawed Iqbal | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 86 | NovationAgreement Jawed Iqbal & Zameen Media & Online Clas | CTR-1QZ6THS | Lease | Zameen Media (Private) Lim | Jawed Iqbal | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 87 | Lease Agreement for Fasilabad Office (2nd FLOOR) (1).pdf | CTR-1QZ6THT | Lease | Zameen Media (Private) Lim | Jawed Iqbal | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 88 | 1901_001.00CTL-LA Mezzanine Faisalabad (2nd Floor) First A | CTR-1QZ6THT | Lease | Zameen Media (Private) Lim | Jawed Iqbal | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 89 | Second Amendment to Lease_Zameen Media and Jawed Iqbal_202 | CTR-1QZ6THT | Lease | Zameen Media (Private) Lim | Jawed Iqbal | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 90 | Third Amendment _Lease Agreement 2nd Floor Susan Road Fais | CTR-1QZ6THT | Lease | Zameen Media (Private) Lim | Jawed Iqbal | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 91 | Supplementary Agreement_Zameen Media and Jawed Iqbal_20200 | CTR-1QZ6THT | Lease | Zameen Media (Private) Lim | Jawed Iqbal | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 92 | Lease Agreement Hydereabad Wali Arcade (1).pdf | CTR-1QZ6TII | Lease | Zameen Media (Private) Lim | Pehlaj Kumar Manglani | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 93 | 178.1 - 1812_01.00STH-LA Wali Arcade 1st Addendum (1).pdf | CTR-1QZ6TII | Lease | Zameen Media (Private) Lim | Pehlaj Kumar Manglani | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 94 | SecondAddendum_ZameenMediaandPehlajKumar_20201126 (1).pdf | CTR-1QZ6TII | Lease | Zameen Media (Private) Lim | Pehlaj Kumar Manglani | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 95 | ATC Lease Agreement (1).pdf | CTR-1QZ6TIM | Lease | Zameen Media (Private) Lim | Amjad Ali | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 96 | First Amendment ATC 9.June.2020 (1).pdf | CTR-1QZ6TIM | Lease | Zameen Media (Private) Lim | Amjad Ali | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 97 | Second Amendment ATC 2.Apr.2021 (1).pdf | CTR-1QZ6TIM | Lease | Zameen Media (Private) Lim | Amjad Ali | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 98 | Third Amendment ATC 29.March.2022 (1).pdf | CTR-1QZ6TIM | Lease | Zameen Media (Private) Lim | Amjad Ali | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 99 | Fourth Amendment-ATC.28.March.2023 (1).pdf | CTR-1QZ6TIM | Lease | Zameen Media (Private) Lim | Amjad Ali | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 100 | Fifth Amendment ATC 11.March.24 - Copy (1).pdf | CTR-1QZ6TIM | Lease | Zameen Media (Private) Lim | Amjad Ali | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 101 | Fifth Amendment Amjad Ali (1).pdf | CTR-1QZ6TIM | Lease | Zameen Media (Private) Lim | Amjad Ali | ACTION_DOCUMENT | compliance | — | — | yes | no | A_COMPLIANCE_SHOULD_READ |
| 102 | Fourth Amendment Amjad Ali (1).pdf | CTR-1QZ6TIM | Lease | Zameen Media (Private) Lim | Amjad Ali | ACTION_DOCUMENT | compliance | — | — | yes | no | A_COMPLIANCE_SHOULD_READ |
| 103 | Third Amendment Lease Agreement Amjad Ali_20220329 (1).pdf | CTR-1QZ6TIM | Lease | Zameen Media (Private) Lim | Amjad Ali | ACTION_DOCUMENT | compliance | — | — | yes | no | A_COMPLIANCE_SHOULD_READ |
| 104 | 2001-07.00CTL-TASSOfficeBahriaTownLahore (1).pdf | CTR-1QZ6TIO | Lease | Zameen Media (Private) Lim | Asif Zia Ullah | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 105 | FirstAddendum_ZameenMediaandAsifZiaUllah_20210302 (1).pdf | CTR-1QZ6TIO | Lease | Zameen Media (Private) Lim | Asif Zia Ullah | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 106 | TerminationAgreement-20210603_ (1).pdf | CTR-1QZ6TIO | Lease | Zameen Media (Private) Lim | Asif Zia Ullah | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 107 | 2002-027.00CTL-TA1stFloorBuilding DHA Karachi (1).pdf | CTR-1QZ6TJA | Lease | Zameen Media (Private) Lim | Mohammad Asif Awan | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 108 | RO-ISB1stFloor (1).pdf | CTR-1QZ6TJD | Lease | Zameen Media (Private) Lim | Chaudhry Tassadaq Hussain | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 109 | RO-ISB3rdFloor (1).pdf | CTR-1QZ6TJE | Lease | Zameen Media (Private) Lim | Chaudhry Tassadaq Hussain | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 110 | RO-RWP Civic Centre (1).pdf | CTR-1QZ6TJF | Lease | Zameen Media (Private) Lim | Tahir Aziz | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 111 | First Amendment civic center RWP (1).pdf | CTR-1QZ6TJF | Lease | Zameen Media (Private) Lim | Tahir Aziz | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 112 | New Lease Agreement Civic Centre Rwp (1).pdf | CTR-1QZ6TJF | Lease | Zameen Media (Private) Lim | Tahir Aziz | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 113 | Lease Agreement (Extension Agreement) Tahir Aziz & Zameen  | CTR-1QZ6TJF | Lease | Zameen Media (Private) Lim | Tahir Aziz | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 114 | Extension_Lease Agreement (Extension Agreement) Tahir Aziz | CTR-1QZ6TJF | Lease | Zameen Media (Private) Lim | Tahir Aziz | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 115 | PeshawarLeaseAgreement (1).pdf | CTR-1QZ6TJG | Lease | Zameen Media (Private) Lim | Mr. Khayal Muhammad, Mr. N | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 116 | 2002_010_00_NTH-LAMallhiPlazaRawalpindi_0001 (1).pdf | CTR-1QZ6TJH | Lease | Zameen Media (Private) Lim | Muhammad Ashraf Ali | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 117 | FSD 4th Floor agreement (1).PDF | CTR-1QZ6TJI | Lease | Zameen Media (Private) Lim | Jawed Iqbal | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 118 | First Amendment to Lease Agreement_Zameen Media and Jawed  | CTR-1QZ6TJI | Lease | Zameen Media (Private) Lim | Jawed Iqbal | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 119 | Second Amendment Lease Agreement 4th Floor Faisalabad_2022 | CTR-1QZ6TJI | Lease | Zameen Media (Private) Lim | Jawed Iqbal | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 120 | Lease Agreement Gulshane JOhar Karachi (1).pdf | CTR-1QZ6TJJ | Lease | Zameen Media (Private) Lim | Zaheer Ahmed, Nazeer Ahmed | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 121 | Fourth Amendment Gulshane Johar Karachi (1).pdf | CTR-1QZ6TJJ | Lease | Zameen Media (Private) Lim | Zaheer Ahmed, Nazeer Ahmed | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 122 | Second Amendment Gulshane johar Karachi (1).pdf | CTR-1QZ6TJJ | Lease | Zameen Media (Private) Lim | Zaheer Ahmed, Nazeer Ahmed | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 123 | Third Amendment Gulshane johar Karachi (1).pdf | CTR-1QZ6TJJ | Lease | Zameen Media (Private) Lim | Zaheer Ahmed, Nazeer Ahmed | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 124 | Fifth Amendment Gulshane Johar Karachi (1).pdf | CTR-1QZ6TJJ | Lease | Zameen Media (Private) Lim | Zaheer Ahmed, Nazeer Ahmed | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 125 | Sixth Amendment KHI Johar 2025_1 (2).pdf | CTR-1QZ6TJJ | Lease | Zameen Media (Private) Lim | Zaheer Ahmed, Nazeer Ahmed | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 126 | 264_Seventh Amendment_Lease Agreement Seventh Amendment_Gu | CTR-1QZ6TJJ | Lease | Zameen Media (Private) Lim | Zaheer Ahmed, Nazeer Ahmed | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 127 | Lease Agreement_Zameen Media and Naveed Hassan_20201228_00 | CTR-1QZ6TKE | Lease | Zameen Media (Private) Lim | Naveed Hassan | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 128 | First Amendment to lease Agreement 20201121 (1).pdf | CTR-1QZ6TKE | Lease | Zameen Media (Private) Lim | Naveed Hassan | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 129 | LeaseAgreement_ZameenMediaandTassadaqHussain_20200930 (1). | CTR-1QZ6TL3 | Lease | Zameen Media (Private) Lim | Ch Tassadaq Hussain | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 130 | LeaseAgreement_ZameenMediaandMoeenNawaz_20201217_0001 (1). | CTR-1QZ6TL7 | Lease | Zameen Media (Private) Lim | Moeen Nawaz | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 131 | LeaseAgreement Arwa Heights 20210604 (1).pdf | CTR-1QZ6TM1 | Lease | Zameen Media (Private) Lim | Tayyab Azam | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 132 | First Amendment Arwa Heights (1).docx | CTR-1QZ6TM1 | Lease | Zameen Media (Private) Lim | Tayyab Azam | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 133 | Second Amendment Arwa Heights (1).pdf | CTR-1QZ6TM1 | Lease | Zameen Media (Private) Lim | Tayyab Azam | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 134 | Third Amendment BTO LHR Arwa Heights (1).pdf | CTR-1QZ6TM1 | Lease | Zameen Media (Private) Lim | Tayyab Azam | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 135 | 425_Fourth_Amendment to Lease Agreement _Arwa Heights_Mr.  | CTR-1QZ6TM1 | Lease | Zameen Media (Private) Lim | Tayyab Azam | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 136 | MuhammadIrfanSabri_20210817. (1).pdf | CTR-1QZ6TM2 | Lease | Zameen Media (Private) Lim | Rehan Munawar | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 137 | Terminationagreement_SF-11SquareOne_20230208 (1).pdf | CTR-1QZ6TM2 | Lease | Zameen Media (Private) Lim | Rehan Munawar | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 138 | Ayyaz Mahmood_20210823 (1).pdf | CTR-1QZ6TM3 | Lease | Zameen Media (Private) Lim | Ayyaz mahmood | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 139 | Samina Afzal_20210816 (1).pdf | CTR-1QZ6TM4 | Lease | Zameen Media (Private) Lim | Samina Afzal | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 140 | Faryad Ahmed Raza_20210816 (1).pdf | CTR-1QZ6TMQ | Lease | Zameen Media (Private) Lim | Faryad Ahmad Raza | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 141 | Muhammad Nasir_20210816_0002 (1).pdf | CTR-1QZ6TMR | Lease | Zameen Media (Private) Lim | Muhammad Nasir | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 142 | MST. Maliha raza Maneka_20210816 (1).pdf | CTR-1QZ6TMS | Lease | Zameen Media (Private) Lim | Maliha Raza Maneka | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 143 | Bilal Mehmood_20210817 (1).pdf | CTR-1QZ6TMT | Lease | Zameen Media (Private) Lim | Bilal Mehmood | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 144 | Afeaz Ahmed & Syed Zain-ul-ABideen_202100817 (1).pdf | CTR-1QZ6TMU | Lease | Zameen Media (Private) Lim | Afraz Ahmed etc. | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 145 | Adnan Hussian & Ali Akram Tahir_20210817 (1).pdf | CTR-1QZ6TMV | Lease | Zameen Media (Private) Lim | Adnan Hussian & Ali Akrama | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 146 | Usman Shahid & hassan Ahmed_20210817 (1).pdf | CTR-1QZ6TMW | Lease | Zameen Media (Private) Lim | Rafay Waheed Khokahar | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 147 | Exit Agreement_Shop_SF 13_Square One (1).pdf | CTR-1QZ6TMW | Lease | Zameen Media (Private) Lim | Rafay Waheed Khokahar | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 148 | Rafay Waheed Khokhar_20210820 (1).pdf | CTR-1QZ6TMX | Lease | Zameen Media (Private) Lim | Rafay Waheed Khokhar | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 149 | Tariq saeed minhas_20210820 (1).pdf | CTR-1QZ6TMY | Lease | Zameen Media (Private) Lim | tariq saeed Minhas | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 150 | Tariq saeed minhas_20210820 TF 09 (1).pdf | CTR-1QZ6TMZ | Lease | Zameen Media (Private) Lim | Tariq saeed Minhas | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 151 | Usman Mahmood & Nabeel Mohsin laliwala_20210823 (1).pdf | CTR-0YGTVC6 | Lease | Zameen Media (Private) Lim | Usman Mahmood & Nabeel Moh | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 152 | Naveed Iqbal_20210816 (1).pdf | CTR-0YGTVC7 | Lease | Zameen Media (Private) Lim | Naveed Iqbal | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 153 | MST Amna Tariq _20210816 (1).pdf | CTR-0YGTVC8 | Lease | Zameen Media (Private) Lim | Mst. Amna Tariq | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 154 | Mst. Mehwish Batool_20210816 (1).pdf | CTR-0YGTVC9 | Lease | Zameen Media (Private) Lim | Mst. Mehwish Batool | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 155 | Mohammad Nadeem Mansha_20210820 (1).pdf | CTR-0YGTVCA | Lease | Zameen Media (Private) Lim | Atif Bashir | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 156 | First Amendment SF-04_1 (1).pdf | CTR-0YGTVCA | Lease | Zameen Media (Private) Lim | Atif Bashir | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 157 | Sofia Asif_20210820 (1).pdf | CTR-0YGTVCB | Lease | Zameen Media (Private) Lim | Sofia Asif | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 158 | Rashid Akhtar Khan_20210820 (1).pdf | CTR-0YGTVCC | Lease | Zameen Media (Private) Lim | Rashid Akhtar Khan | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 159 | Muhammad Adil Bajwa 20210820 (1).pdf | CTR-0YGTVCD | Lease | Zameen Media (Private) Lim | Muhammad Adil Bajwa | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 160 | Muhammad Ashar Hussian Malik_20210820 (1).pdf | CTR-0YGTVCE | Lease | Zameen Media (Private) Lim | Muhammad Ashar Hussain Mal | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 161 | Talat Ali Maan_20210820 (1).pdf | CTR-0YGTVCF | Lease | Zameen Media (Private) Lim | Talat Ali Maan | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 162 | Danish Jamil_20210816 (1).pdf | CTR-0YGTVD1 | Lease | Zameen Media (Private) Lim | Danish Jamil | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 163 | Lease agreement_Sajjad hussain_20210908_ (1).pdf | CTR-0YGTVD2 | Lease | Zameen Media (Private) Lim | Sajjad Hussain | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 164 | Termination Agreement_Sajjad Hussain_20220617 (1).pdf | CTR-0YGTVD2 | Lease | Zameen Media (Private) Lim | Sajjad Hussain | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 165 | Lease agreement_Azim Shahzad,Amir shahzad_Zameen Media (Pr | CTR-0YGTVD3 | Lease | Zameen Media (Private) Lim | Azzam Shahzad, Amir Shahza | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 166 | LeaseAgreement_tassadaqhussain_20211101_ (1).pdf | CTR-0YGTVD7 | Lease | Zameen Media (Private) Lim | Tassadaq hussain, Tanvir H | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 167 | LeaseAgreement_IndustryFacilitationCentre_ZameenMedia_2021 | CTR-0YGTVD8 | Lease | Zameen Media (Private) Lim | Taj Muhammad Rizvi | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 168 | 557 First Addmendum IFC_0001 (1).pdf | CTR-0YGTVD8 | Lease | Zameen Media (Private) Lim | Taj Muhammad Rizvi | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 169 | Lease Ageement_Jawed Iqbal_Zameen Media_20220105_Ground Fl | CTR-0YGTVD9 | Lease | Zameen Media (Private) Lim | Jawed iqbal | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 170 | FSD Termination B&G_1 (1).pdf | CTR-0YGTVD9 | Lease | Zameen Media (Private) Lim | Jawed iqbal | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 171 | lease Agreement_Hafiz Muhammad Maqsood_Zameen Media_202112 | CTR-0YGTVDA | Lease | Zameen Media (Private) Lim | Hafiz Muhammad Maqsood | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 172 | First Amendment Second Floor Ak Tower Gujranwala (1).pdf | CTR-0YGTVDA | Lease | Zameen Media (Private) Lim | Hafiz Muhammad Maqsood | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 173 | LeaseAgreementMegaTowerGroundFloor_NaveedShah_EMPGLABS_202 | CTR-0YGTVDW | Lease | Zameen Media (Private) Lim | Naveed Shah | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 174 | Novation Agreement Ground Floor Mega Tower (1).pdf | CTR-0YGTVDW | Lease | Zameen Media (Private) Lim | Naveed Shah | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 175 | First Amendment Ground Floor Mega Tower ZMPL (1).pdf | CTR-0YGTVDW | Lease | Zameen Media (Private) Lim | Naveed Shah | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 176 | Second Amendment MTL GF ZM 2025 (2).pdf | CTR-0YGTVDW | Lease | Zameen Media (Private) Lim | Naveed Shah | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 177 | First Amendment Maintenance Services Agreement (Naveed Sha | CTR-0YGTVDW | Lease | Zameen Media (Private) Lim | Naveed Shah | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 178 | 1st Amendment Maintenance service Mega Tower Ground Floor  | CTR-0YGTVDW | Lease | Zameen Media (Private) Lim | Naveed Shah | ACTION_DOCUMENT | compliance | — | — | yes | no | A_COMPLIANCE_SHOULD_READ |
| 179 | LeaseAgreementBoulevard64_20211216 (1).pdf | CTR-0YGTVE0 | Lease | Zameen Media (Private) Lim | Asim Saeed | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 180 | NovationAgreement_Boulevard64_20220309 (1).pdf | CTR-0YGTVE0 | Lease | Zameen Media (Private) Lim | Asim Saeed | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 181 | leaseAgreement_Abdullatif_ZameenMedia_20220215 bahira town | CTR-0YGTVE3 | Lease | Zameen Media (Private) Lim | Abdul Latif, Arham Yousuf  | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 182 | LeaseAgreement4thFloorPeshawar_20210901 (1).pdf | CTR-0YGTVE4 | Lease | Zameen Media (Private) Lim | Abdul Razziq , Muhammad Sh | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 183 | LeaseAgreement1stFloorCapriPlazaJehlum_20210910 (1).pdf | CTR-0YGTVE5 | Lease | Zameen Media (Private) Lim | Zia Ashraf and Manzoor Ash | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 184 | Lease Agreement 1st & 2nd Floor Bhughti Plaza multan_20220 | CTR-0YGTVER | Lease | Zameen Media (Private) Lim | Sardar Khawind Bukhsh , Ba | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 185 | LeaseAgreement3rdFloorNewAurigaShopingMall_20220527 (1).pd | CTR-0YGTVES | Lease | Zameen Media (Private) Lim | Good Homes Pvt. Ltd. Throu | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 186 | 703 First Amendment 20240828_0001 (1).pdf | CTR-0YGTVES | Lease | Zameen Media (Private) Lim | Good Homes Pvt. Ltd. Throu | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 187 | First Amendment NASM 2024-27_1 (1).pdf | CTR-0YGTVES | Lease | Zameen Media (Private) Lim | Good Homes Pvt. Ltd. Throu | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 188 | MaintenanceServiceAgreement_Photocopiermachines_20220907 ( | CTR-0YGTVEW | Lease | Zameen Media (Private) Lim | Paragon Copier Solution Th | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 189 | FirstamedmentofMaintenanceServiceAgreement_Photocopiermach | CTR-0YGTVEW | Lease | Zameen Media (Private) Lim | Paragon Copier Solution Th | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 190 | LeaseAgreementwithM_IlyasAliKhan_20220101 (1).pdf | CTR-0YGTVEY | Lease | Zameen Media (Private) Lim | M. Ilyas Ali Khan | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 191 | Warehouse Peco Road Agreement 2023_1 (1).pdf | CTR-0YGTVEY | Lease | Zameen Media (Private) Lim | M. Ilyas Ali Khan | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 192 | LeaseAgreement_SF-11SquareOne_AbdulRehman_ZameenMedia_2023 | CTR-0YGTVFN | Lease | Zameen Media (Private) Lim | Abdul Rehman | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 193 | 1803_020.00STH-LANiceTradeOrbit 2018 to 2019 (1).pdf | CTR-0YGTVFP | Lease | Zameen Media (Private) Lim | sheikh Nazaz Ali | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 194 | 1803_020.00STH-LANiceTradeOrbitGPOT GPA (1).pdf | CTR-0YGTVFP | Lease | Zameen Media (Private) Lim | sheikh Nazaz Ali | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 195 | 136.1-1903_019.00_STH-LANiceTradeOrbit 2019 to 2020 (1).pd | CTR-0YGTVFP | Lease | Zameen Media (Private) Lim | sheikh Nazaz Ali | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 196 | NTOLeaseAgreementKarachi2020-2021 (1).pdf | CTR-0YGTVFP | Lease | Zameen Media (Private) Lim | sheikh Nazaz Ali | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 197 | LeaseAgreement_ZameenMediaandNICETradeservices_2021 to 202 | CTR-0YGTVFP | Lease | Zameen Media (Private) Lim | sheikh Nazaz Ali | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 198 | LeaseAgreement_SuriyaMumtaz_ZameenMedia_20211122_ (1).pdf | CTR-0YGTVFP | Lease | Zameen Media (Private) Lim | sheikh Nazaz Ali | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 199 | NTO LEASE AGREEMEMT 2023 TO 2024 (3).pdf | CTR-0YGTVFP | Lease | Zameen Media (Private) Lim | sheikh Nazaz Ali | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 200 | Lease Agreement _Suriya Mumtaz_Zameen Media _4th Floor Nic | CTR-0YGTVFP | Lease | Zameen Media (Private) Lim | sheikh Nazaz Ali | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 201 | 136-159-329-561 Lease Agreement NTO_0001 (1).pdf | CTR-0YGTVFP | Lease | Zameen Media (Private) Lim | sheikh Nazaz Ali | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 202 | Office Space sharing Agreement_20231013 (1).pdf | CTR-0YGTVFV | Lease | Zameen Media Pvt Ltd | DaftarKhawan | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 203 | Lease Agreements 68 High Street (5128 sqft) (1).pdf | CTR-0YGTVGH | Lease | Zameen Media Pvt Ltd | M/S High Street | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 204 | Lease Agreements 68 High Street (5672 sqft) (1).pdf | CTR-0YGTVGI | Lease | Zameen Media Pvt Ltd | M/S High Street | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 205 | FSD B&G 23 to 24_1 (1).pdf | CTR-0YGTVGL | Lease | Zameen Media Pvt Ltd | Ms. Saima Javed | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 206 | Lease Agreement (Pakistan Industrial & Zameen Media)_0001  | CTR-0YGTVGP | Lease | Zameen Media (Private) Lim | Taj Muhammad Rizvi | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 207 | ZMPL 12_First Amendment Lease Agreement_Bughti Plaza_ 3rd  | CTR-0YGTVHC | Lease | Zameen Media (Pvt) Limited | Sardar Khawind and Bashir  | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 208 | ZMPL 12_Lease Agreement Bughti Plaza Third Floor_20230410  | CTR-0YGTVHC | Lease | Zameen Media (Pvt) Limited | Sardar Khawind and Bashir  | RECORD_DOCUMENT | compliance | — | — | yes | no | A_COMPLIANCE_SHOULD_READ |
| 209 | 1_Lease Agreement Plot for Zameen Vault 20260128_0001.pdf | CTR-1JWSL7P | Lease |  | Ishtiaq Ali Khan | RECORD_DOCUMENT | compliance | — | — | yes | no | A_COMPLIANCE_SHOULD_READ |
| 210 | Undertaking Lease Agreement Plot for Zameen Vault 20260128 | CTR-1JWSL7P | Lease |  | Ishtiaq Ali Khan | RECORD_DOCUMENT | compliance | — | — | yes | no | A_COMPLIANCE_SHOULD_READ |
| 211 | 1_Lease Agreement Plot for Zameen Vault 20260128_0001 (1). | CTR-1JWSL7P | Lease |  | Ishtiaq Ali Khan | RECORD_DOCUMENT | compliance | — | — | yes | no | A_COMPLIANCE_SHOULD_READ |
| 212 | Undertaking Lease Agreement Plot for Zameen Vault 20260128 | CTR-1JWSL7P | Lease |  | Ishtiaq Ali Khan | RECORD_DOCUMENT | compliance | — | — | yes | no | A_COMPLIANCE_SHOULD_READ |
| 213 | Agreement of supply Vey bottle_EMPG LABS_20220125_0001 (1) | CTR-1FYJTOS | Service Agreement | EMPG Labs (SMC-Private) Li | Fluid Technology Internati | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 214 | First and Second Amendment_Maintenance Agreement_GF_MT_Nav | CTR-1C2LCUG | Service Agreement | Dubizzle Labs (SMC-Private | Naveed Shah | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 215 | MaintenanceServicesAgreemenThirdFloorMagaTower_NaveedShah_ | CTR-1C2LCUH | Service Agreement | Dubizzle Labs (SMC-Private | Naveed Shah | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 216 | SecurityServiceagreement_FistSecurity_EMPGLABS_20220124 (1 | CTR-1C2LCUI | Service Agreement | Dubizzle Labs (SMC-Private | Fist Security Pvt. Ltd. Th | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 217 | SecurityServicesagreement_ZIMSSecurity_EMPGLABS_20220208 ( | CTR-1C2LCUJ | Service Agreement | Dubizzle Labs (SMC-Private | ZIMS Security Pvt. Ltd. Th | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 218 | Service & Maintenace agreement_EMPG Labs_HMA Building Main | CTR-1C2LCUN | Service Agreement | Dubizzle Labs (SMC-Private | Mustansir Fakhruddin | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 219 | Novation Agreement _HMA Building_EMPG Labs_20211103_ (1).p | CTR-1C2LCUN | Service Agreement | Dubizzle Labs (SMC-Private | Mustansir Fakhruddin | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 220 | Maintenance Services Agreement_Dubizzle_Labs Second floor  | CTR-1C2LCVA | Service Agreement | Dubizzle Labs (Private) Li | Naveed Shah | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 221 | Maintenance Services Agreement _Pearl One_Munawar Hussain_ | CTR-1C2LCVC | Service Agreement | Dubizzle Labs (Private) Li | Munawar Hussain Malik | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 222 | QA Agreement empg_1 (1).pdf | CTR-1C2LCVD | Service Agreement | Dubizzle Labs (SMC-Private | Zahid Anwar | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 223 | Contract for Security Guards_Zameen Development and ZIMS S | CTR-1AVF7HE | Service Agreement | Zameen Developments (Priva | Lt Col (R) Rashid Ahmad | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 224 | FirstAmendmentZIMSSecurity_ZameenDevelopments_20211213 (1) | CTR-1AVF7HE | Service Agreement | Zameen Developments (Priva | Lt Col (R) Rashid Ahmad | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 225 | MaintenanceServicesAgreemnet_ZameenDevelopmentsandNaveedSh | CTR-1AVF7HH | Service Agreement | Zameen Developments (Priva | Naveed Shah | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 226 | QA Agreement ZD_1 (1).pdf | CTR-1AVF7HI | Service Agreement | Zameen Development | Zahid Anwar | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 227 | ZameenDevelopmentsAGL (1).PDF | CTR-1AVF7HJ | Service Agreement | Zameen Developments (Priva | Askari Guards (PRIVATE) Li | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 228 | QarshiZameenDevelopments (1).pdf | CTR-0WFUCFL | Service Agreement | Zameen Developments (Priva | Muhammad Riaz IQbal | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 229 | QarshiZameenDevelopmentsAddendum (1).pdf | CTR-0WFUCFL | Service Agreement | Zameen Developments (Priva | Muhammad Riaz IQbal | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 230 | AdvisoryServicesRelatedtoEstablishingREIT_ZameenDevelopmen | CTR-0WFUCFM | Service Agreement | Zameen Developments (Priva | Frontline Advisory Pvt. Lt | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 231 | ConsultancyAgreement_AbidHussain_ZameenDevelopments_202212 | CTR-0WFUCFO | Service Agreement | Zameen Developments (Priva | Abid Hussain | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 232 | EngagementAgreementAccountingServices_ZameenDevelopments_P | CTR-0WFUCFQ | Service Agreement | Zameen Developments (Priva | Prescient Consulting | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 233 | QA Agreement ZD_1 (1).pdf | CTR-0WFUCFS | Service Agreement | Zameen Developments (Priva | Zahid Anwar | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 234 | DigitalMarketingAgreement_HBFC_ZameenMedia_20220622 (1).pd | CTR-10EG48A | Service Agreement | Zameen Media (Private) Lim | HBFCL Through Faisal Murad | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 235 | 20190801DMA-HBFCL (1).pdf | CTR-10EG48B | Service Agreement | Zameen Media (Private) Lim | Faisal Murad | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 236 | 1910_018.00.CTL-SAATMAgreement-JSBank (1).pdf | CTR-1QZ6TGQ | Service Agreement | Zameen Media (Private) Lim | Rafiq Ghulam Hussain | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 237 | 2019_1125ServiceAgreement-PestControl_ZMPL (1).pdf | CTR-1QZ6TGT | Service Agreement | Zameen Media (Private) Lim | Syed Zeeshan Abbas Kazmi | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 238 | 1911_028.00CTL-SS-AskariGuardsPrivateLimited (1).pdf | CTR-1QZ6TGU | Service Agreement | Zameen Media (Private) Lim | Jarrar Attique Chohan | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 239 | 1909_001.00CTL-Service Agreement for payment of WASA utili | CTR-1QZ6TGW | Service Agreement | Zameen Media (Private) Lim | Muhammad Khalid Chaudhry | PAYMENT_RECEIPT | commercial | — | — | no | yes | D_HISTORICAL_SOURCE_ONLY |
| 240 | 1911_014.00-CTL-SAQarshiIndustriesPVTLimited (1).pdf | CTR-1QZ6TGX | Service Agreement | Zameen Media (Private) Lim | Muhammad Riaz IQbal | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 241 | First Addendum Qarshi Industries ZMPL (1).pdf | CTR-1QZ6TGX | Service Agreement | Zameen Media (Private) Lim | Muhammad Riaz IQbal | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 242 | 1902_006.00CTL-CA Warehouse Peco Road Lahore (1).pdf | CTR-1QZ6THP | Service Agreement | Zameen Media (Private) Lim | Muhammad Ali Ilyas Khan | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 243 | Ammendment 01 in Consultancy Agreement (1).pdf | CTR-1QZ6THP | Service Agreement | Zameen Media (Private) Lim | Muhammad Ali Ilyas Khan | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 244 | Second Amendment_Zameen Media and M Ali Ilyas Khan_2021030 | CTR-1QZ6THP | Service Agreement | Zameen Media (Private) Lim | Muhammad Ali Ilyas Khan | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 245 | AgreementforannualservicemaintananceofFireSecurityEquipmen | CTR-1QZ6TIF | Service Agreement | Zameen Media (Private) Lim | Tariq Afzaal | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 246 | FirstAmendment_ZameenMediaandTariqAfzaal_20210120_0001 (1) | CTR-1QZ6TIF | Service Agreement | Zameen Media (Private) Lim | Tariq Afzaal | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 247 | Fist Security Agreement Karachi (1).pdf | CTR-1QZ6TIH | Service Agreement | Zameen Media (Private) Lim | Gulraiz Afzal Khan | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 248 | AddendumFistfinal (1).pdf | CTR-1QZ6TIH | Service Agreement | Zameen Media (Private) Lim | Gulraiz Afzal Khan | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 249 | 179.1-1911_008.00STH-ServiceAgreementMYCARTSecondAddendum  | CTR-1QZ6TIH | Service Agreement | Zameen Media (Private) Lim | Gulraiz Afzal Khan | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 250 | FistSecurityFirstAmendment (1).pdf | CTR-1QZ6TIH | Service Agreement | Zameen Media (Private) Lim | Gulraiz Afzal Khan | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 251 | Addendumno3totheSecurityServicesAgreement_ZameenMediaandFi | CTR-1QZ6TIH | Service Agreement | Zameen Media (Private) Lim | Gulraiz Afzal Khan | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 252 | FistSecurity_SecondAmendment_20210601 (1).pdf | CTR-1QZ6TIH | Service Agreement | Zameen Media (Private) Lim | Gulraiz Afzal Khan | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 253 | FourthAddendum_ZameenMedia_FistSecurity_20210901_ (1).pdf | CTR-1QZ6TIH | Service Agreement | Zameen Media (Private) Lim | Gulraiz Afzal Khan | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 254 | FirstAmendment_ZameenMediaandTariqAfzaal_20210120_0001 (1) | CTR-1QZ6TIH | Service Agreement | Zameen Media (Private) Lim | Gulraiz Afzal Khan | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 255 | 179-1911_008.00STH-ServiceAgreementMYCART (1).pdf | CTR-1QZ6TIJ | Service Agreement | Zameen Media (Private) Lim | MYCART (Private) Limited | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 256 | First Amendment of Askari guards Agreement_Zameen Media_20 | CTR-1QZ6TIK | Service Agreement | Zameen Media (Private) Lim | Askari guards Pvt Ltd thro | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 257 | 1910_025.00CTL-SAMYHCM (1).pdf | CTR-1QZ6TIL | Service Agreement | Zameen Media (Private) Lim | MYHCM Pakistan (Pvt) Limit | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 258 | 20200106 DMA Allied Bank Limited.pdf | CTR-1QZ6TIN | Service Agreement | Zameen Media (Private) Lim | Allied Bank Limited | (not in compliance root) | commercial | — | — | no | yes | B_COMMERCIAL_ONLY |
| 259 | Digital Marketing Agreement no. 91_0001.pdf | CTR-1QZ6TIN | Service Agreement | Zameen Media (Private) Lim | Allied Bank Limited | (not in compliance root) | commercial | — | — | no | yes | B_COMMERCIAL_ONLY |
| 260 | FinalDealerSERVICESAGREEMENT (1).pdf | CTR-1QZ6TJB | Service Agreement | Zameen Media (Private) Lim | Pirzada Muhammad Matee-ur- | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 261 | 1901-001.00CTL-RSARoyalHumanResourcePvtLtd (1).pdf | CTR-1QZ6TJC | Service Agreement | Zameen Media (Private) Lim | Royal Human Resource Pvt L | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 262 | 20200721ServiceAgreementforpaymentofWASAutilitybill_0001 ( | CTR-1QZ6TK5 | Service Agreement | Zameen Media (Private) Lim | Muhammad Javed Iqbal | PAYMENT_RECEIPT | commercial | — | — | no | yes | D_HISTORICAL_SOURCE_ONLY |
| 263 | FirstddednumtoPhotocopierMachines_ZameenMediaandSafeSecure | CTR-1QZ6TK6 | Service Agreement | Zameen Media (Private) Lim | Khateeb Murtaza | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 264 | FirstAmendmenttoPhotocopierMachines_ZameenMediaandSafeSecu | CTR-1QZ6TK6 | Service Agreement | Zameen Media (Private) Lim | Khateeb Murtaza | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 265 | AgreementCanteen_ZMPL (1).PDF | CTR-1QZ6TKA | Service Agreement | Zameen Media (Private) Lim | Azhar Aslam Lahore Spices | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 266 | Agreement for plants Nishat Nursery (1).pdf | CTR-1QZ6TKC | Service Agreement | Zameen Media (Private) Lim | Muhammad Muzammil | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 267 | FawadKhanAgreementExecuted (1).pdf | CTR-1QZ6TKD | Service Agreement | Zameen Media (Private) Lim | Fawad Afzal Khan | EXECUTED_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 268 | First Amendment Fawad Khan Agreement (1).pdf | CTR-1QZ6TKD | Service Agreement | Zameen Media (Private) Lim | Fawad Afzal Khan | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 269 | Agreement_ZameenMediatoR-SCInternet_20201023 (1).pdf | CTR-1QZ6TL0 | Service Agreement | Zameen Media (Private) Lim | Mariam Saleem | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 270 | Digital Marketing Agreement no. 93_0001.pdf | CTR-1QZ6TL1 | Service Agreement | Zameen Media (Private) Lim | Faysal Bank Limited throug | (not in compliance root) | commercial | — | — | no | yes | B_COMMERCIAL_ONLY |
| 271 | FirstAddendum_ZameenMediaandBrainchildCommunicationPkaista | CTR-1QZ6TL2 | Service Agreement | Zameen Media (Private) Lim | Brainchild Communications  | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 272 | Fourth Addendum of Principal Agreement_Brainchild Communic | CTR-1QZ6TL2 | Service Agreement | Zameen Media (Private) Lim | Brainchild Communications  | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 273 | First Amendment_Contract for Security Guards Services_Zame | CTR-1QZ6TL5 | Service Agreement | Zameen Media (Private) Lim | Lt Col (R) Rashid Ahmad | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 274 | second Amendemnt_ZIMS Security_20211213 (1).pdf | CTR-1QZ6TL5 | Service Agreement | Zameen Media (Private) Lim | Lt Col (R) Rashid Ahmad | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 275 | Fourth Amdnement Zameen Media Punjab Zims Security (1).pdf | CTR-1QZ6TL5 | Service Agreement | Zameen Media (Private) Lim | Lt Col (R) Rashid Ahmad | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 276 | AgreementforCanteen_ZameenMediaandNoumanNazir_20201230 (1) | CTR-1QZ6TL6 | Service Agreement | Zameen Media (Private) Lim | Nouman Nazir | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 277 | Agreement for Canteen_Zameen Media and Shezan Bakers & Con | CTR-1QZ6TL9 | Service Agreement | Zameen Media (Private) Lim | Salman Riaz Chaudhary | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 278 | DigitalMarketingAgreement_MCB_20210415 (1).pdf | CTR-1QZ6TLX | Service Agreement | Zameen Media (Private) Lim | Adnan Aurangzab Khan | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 279 | DigitalMarketingAgreement_20210614JSBank (1).pdf | CTR-1QZ6TLY | Service Agreement | Zameen Media (Private) Lim | JS Bank Limited | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 280 | AmendmentNo.3_PTML (1).pdf | CTR-1QZ6TLZ | Service Agreement | Zameen Media (Private) Lim | Ahmed Kamal | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 281 | DigitalMarkeetingagreement_ZameenMedia_StandardCharterdBan | CTR-0YGTVD5 | Service Agreement | Zameen Media (Private) Lim | Standard Chartered Bank Pa | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 282 | digitalmarketingagreement_HBL (1).pdf | CTR-0YGTVD6 | Service Agreement | Zameen Media (Private) Lim | Muhammad Afaq Khan | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 283 | First Amendment MTL Maiintenance 8 Floor ZM (1).pdf | CTR-0YGTVDY | Service Agreement | Zameen Media (Private) Lim | Naveed Shah | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 284 | Second Amendment_Maintenance Agreement_ MTL 8 Floor ZM (1) | CTR-0YGTVDY | Service Agreement | Zameen Media (Private) Lim | Naveed Shah | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 285 | AgrementBetween_ZameenMedia_Rozee.pk_20220419 (1).pdf | CTR-0YGTVE1 | Service Agreement | Zameen Media (Private) Lim | ROZEE.PK (Shahbaz Khan) | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 286 | First Amendment Zameen Media North Zims Security (1).pdf | CTR-0YGTVE2 | Service Agreement | Zameen Media (Private) Lim | ZIMS Security Pvt Ltd thro | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 287 | Nature Healthy Life Water Agreement (1).pdf | CTR-0YGTVEU | Service Agreement | Zameen Media (Pvt) Ltd | Nature Healthy Life | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 288 | AgreementofsupplyVeybottle_20220807 (1).pdf | CTR-0YGTVEV | Service Agreement | Zameen Media (Private) Lim | Syed Zubair Hussain | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 289 | FirstAmendmentofSupplyVeyBottle_20220329 (1).pdf | CTR-0YGTVEV | Service Agreement | Zameen Media (Private) Lim | Syed Zubair Hussain | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 290 | Warehouse Peco Road 2023 Consultancy_1 (1).pdf | CTR-0YGTVEX | Service Agreement | Zameen Media (Private) Lim | Muhammad Ali Ilyas Khan | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 291 | FirstamendmentofTCSserviceAgreement_Domestic Service_20221 | CTR-0YGTVFQ | Service Agreement | Zameen Media (Private) Lim |  | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 292 | Second Amendment TCS Agreement 23 to 24_1 (2).pdf | CTR-0YGTVFQ | Service Agreement | Zameen Media (Private) Lim |  | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 293 | Third Amendment TCS Agreement 2025_1 (2).pdf | CTR-0YGTVFQ | Service Agreement | Zameen Media (Private) Lim |  | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 294 | Fourth Amendment to Service Agreement (TCS & Zameen Media) | CTR-0YGTVFQ | Service Agreement | Zameen Media (Private) Lim |  | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 295 | 098-20190318MaintenanceServiceAgreement-NTO-pdf (1).pdf | CTR-0YGTVFS | Service Agreement | Zameen Media (Private) Lim | Mr. Shaikh Nazaz Ali | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 296 | AuthorityLetter_NTO (1).pdf | CTR-0YGTVFS | Service Agreement | Zameen Media (Private) Lim | Mr. Shaikh Nazaz Ali | CORRESPONDENCE | commercial | — | — | no | yes | D_HISTORICAL_SOURCE_ONLY |
| 297 | 098.1-20190318MaintenanceServiceAgreement-NTO-pdf (1).pdf | CTR-0YGTVFS | Service Agreement | Zameen Media (Private) Lim | Mr. Shaikh Nazaz Ali | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 298 | MaintenanceServicesAgreement_NiceTradeServices_ZameenMedia | CTR-0YGTVFS | Service Agreement | Zameen Media (Private) Lim | Mr. Shaikh Nazaz Ali | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 299 | Maintenance Services Agreement_NTO_20250108 (1).pdf | CTR-0YGTVFS | Service Agreement | Zameen Media (Private) Lim | Mr. Shaikh Nazaz Ali | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 300 | Honda Township Agreement 2023_1 (1).pdf | CTR-0YGTVGK | Service Agreement | Zameen Media Pvt Ltd | Honda Township | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 301 | Agreement Glimmer & Co 2023_1 (1).pdf | CTR-0YGTVGM | Service Agreement | Zameen Media Pvt Ltd | Rehan Munawar Ahmed | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 302 | Honda Fort Agreement_1 (1).pdf | CTR-0YGTVGO | Service Agreement | Zameen Media Pvt Ltd | Honda Fort (Private) Limit | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 303 | PACRA-ZameenVentureOnePrivateLimited-RatingMandate20200430 | CTR-1QW6Z0F | Service Agreement |  | Zameen Venture One (Privat | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 304 | PACRA-ZameenVenturePrivateLimited-FirstAddendumtoRatingAgr | CTR-1QW6Z0F | Service Agreement |  | Zameen Venture One (Privat | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 305 | EngagementAgreementAccountingServices_ZameenVentureOne_Pre | CTR-1QW6Z0H | Service Agreement |  | Zameen Venture One (Privat | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 306 | SecurityGuardServicesAgreement_ZIMSSecurity_EDZDDevelopers | CTR-1CRU46F | Service Agreement |  | EDZD Developers | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 307 | SecurityGuardServicesAgreement_ZIMSSecurity_EDZDDevelopers | CTR-1CRU46F | Service Agreement |  | EDZD Developers | RECORD_DOCUMENT | compliance | — | — | yes | no | A_COMPLIANCE_SHOULD_READ |
| 308 | SecurityServicesagreementAskariGuards_Mall35_20220208.pdf | CTR-0MISJ1X | Service Agreement |  | Mall 35 | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 309 | Mall35AGL.PDF | CTR-0MISJ1Y | Service Agreement |  | Mall 35 | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 310 | FirstAmendmentofAskariguardsAgreement_Mall35_20191126.pdf | CTR-0MISJ1Y | Service Agreement |  | Mall 35 | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 311 | SecurityGuardServicesAgreement_ZIMSSecurity_ZameenOmega_20 | CTR-15DB5YD | Service Agreement |  | Zameen Omega (SMC-Private) | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 312 | SecurityGuardServicesAgreement_ZIMSSecurity_ZameenOmega_20 | CTR-15DB5YD | Service Agreement |  | Zameen Omega (SMC-Private) | RECORD_DOCUMENT | compliance | — | — | yes | no | A_COMPLIANCE_SHOULD_READ |
| 313 | MutualNon-DisclosureAgreement_ZameenDevelopments_Frontline | CTR-0WFUCFN | Other Spend | Zameen Developments Privat | Frontline Advisory Through | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 314 | Non-DisclosureAgreement_ZameenDevelopments_PrescientCosult | CTR-0WFUCFP | Other Spend | Zameen Developments (Priva | Prescient Consulting Pvt L | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 315 | 20191128-NDAAPNABANKbd (1).pdf | CTR-1QZ6TGP | Other Spend | Zameen Media (Private) Lim | M. Gulistan Malik | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 316 | 1808_013.00CTL-SalePurchaseAgreementACsSalePurchase (1).pd | CTR-1QZ6TGV | Other Spend | Zameen Media (Private) Lim | Aqeel Hussain | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 317 | Lease Agreeemtn Business Aventue Zameen Media Zulfiqar Ali | CTR-1QZ6TLV | Historical Action | Zameen Media (Private) Lim | Zulfiqar Ali | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 318 | NDAZAMEEN-WHR_220719_EXECUTED17Sept2019SignedbyBothEntitie | CTR-0YGTVEZ | Other Spend | Zameen Media (Private) Lim | WYNDHAM Hotel Asia Pacific | EXECUTED_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 319 | Lease Agreement Warehouse Green Town (1).pdf | CTR-0YGTVFR | Historical Action | Zameen Media (Private) Lim | Nayyer Hussain Chaudhry | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 320 | NovationAgreementWithNayyerHussain_20220325 (1).pdf | CTR-0YGTVFR | Historical Action | Zameen Media (Private) Lim | Nayyer Hussain Chaudhry | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 321 | First Amendment WHS GTL 23 to 25_1 (1).pdf | CTR-0YGTVFR | Historical Action | Zameen Media (Private) Lim | Nayyer Hussain Chaudhry | ACTION_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 322 | Franchise Agreement_Mall 35 & Hotel One_20200225.pdf | CTR-0MISJ1Z | Other Spend |  | Mall 35 | RECORD_DOCUMENT | commercial | compliance | — | yes | yes | C_SHARED_COMMERCIAL_COMPLIANCE |
| 323 | Franchise Agreement_Mall 35 & Hotel One_20200225 (1).pdf | CTR-0MISJ1Z | Other Spend |  | Mall 35 | RECORD_DOCUMENT | compliance | — | — | yes | no | A_COMPLIANCE_SHOULD_READ |

Full machine-readable detail, including each document's Drive file id, source folder and the exact
reason for its current scope: `audit/spend-document-access-review.json`.