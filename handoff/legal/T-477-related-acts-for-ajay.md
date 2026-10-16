# T-477: related acts now keep their sections (for Ajay's byte-check)

Ticket: `handoff/tickets/T-477-promoted-path-drops-act-sections.md`. Branch `fix/t-477-act-sections`.

1. What changed: a template built from a document-rule JSON (the promoted path) used to list only act names under RELATED ACTS and dropped the sections. It now keeps them.
2. Format: `<act> (<ref>; <ref>)`, refs verbatim from the pack file. Examples from the after-dump:
   - affidavit_in_support: `Code of Civil Procedure, 1908 (Order XIX; Order XIX Rule 3), Notaries Act, 1952 (S.8), Bharatiya Sakshya Adhiniyam (BSA), 2023 (Schedule)`
   - mandamus: `Constitution of India (Article 32; Article 226), Specific Relief Act, 1963 (S.38; S.39)`
   - discharge_application: `Bharatiya Nagarik Suraksha Sanhita, 2023 (BNSS) (S.250; S.251; S.261; S.262; S.263; S.268; S.438; S.440; S.442), Bharatiya Nyaya Sanhita, 2023 (BNS) (S.85; S.80; S.316(2); S.318(4)), Negotiable Instruments Act, 1881 (S.138; S.141)`
3. S. rule: a ref that starts with a digit is printed with "S." in front (Ajay f9415fe8), so a bare `138` prints as `S.138`. Refs that already start with a word (Order, Article, Schedule, S.) are left as they are.
4. Marker rule: an entry that applies only in some cases ends with `[only when: <plain words>]` in the text the model sees. If the model echoes the marker into a draft, `sanitiseAIBody` strips it (Arjun).
5. default_bail: the CrPC entry in the default_bail config is built by the same helper, so it prints in the same format.
6. bail_regular merge: `relevantActs` then `relatedActs` are merged into one list (Ajay b101b4eb). The bail_regular drafting path uses its hand-written override; only the promoted registry config changes. A re-seed of promoted templates happens on the next seed because the content hash changes.
7. What a promoted draft's model now sees: one RELATED ACTS line per pack in the format above, with sections and markers, instead of bare act names.
8. Notes: no golden snapshot pins RELATED ACTS, so the dump below is the review artefact. mandamus goes from empty to 2 entries, and `articles` get an "Article " prefix (existing reader behaviour). The unused registry `legal_notice_s138` config is out of scope.

## Conditional entries (marker table)

Count found in the after-dump: 11 entries with `applies_when` in the pack files (the marker `[only when: ...]`) plus 1 entry with `applicableWhen` (bail_regular, key `dv_dowry`), 12 in all.

| #   | Pack                   | Act                                                                                         | Exact rendered marker                                                      |
| --- | ---------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | bail_regular           | Protection of Women from Domestic Violence Act (PWDVA), 2005 (S.12; S.18; S.19; S.20; S.22) | `[only when: the offence arises from domestic violence or a dowry demand]` |
| 2   | distribution_agreement | FEMA 1999                                                                                   | `[only when: Cross-border distributor]`                                    |
| 3   | distribution_agreement | Customs Act 1962                                                                            | `[only when: Imported goods]`                                              |
| 4   | employment_agreement   | Industrial Employment (Standing Orders) Act 1946                                            | `[only when: Industrial establishments >= 100 (or 50 in some states)]`     |
| 5   | employment_agreement   | Industrial Disputes Act 1947                                                                | `[only when: Workmen]`                                                     |
| 6   | franchise_agreement    | FEMA 1999 + FEMA (Current Account Transactions) Rules 2000                                  | `[only when: Cross-border]`                                                |
| 7   | franchise_agreement    | Food Safety and Standards Act 2006                                                          | `[only when: Food/F&B franchise]`                                          |
| 8   | loan_agreement         | SARFAESI Act 2002                                                                           | `[only when: Lender is Bank/NBFC]`                                         |
| 9   | loan_agreement         | State Money-Lenders Acts                                                                    | `[only when: Private money-lending business]`                              |
| 10  | loan_agreement         | FEMA 1999 + ECB Master Direction                                                            | `[only when: Foreign lender]`                                              |
| 11  | shareholders_agreement | FEMA 1999 + FEMA (NDI) Rules 2019                                                           | `[only when: Foreign investor]`                                            |
| 12  | shareholders_agreement | SEBI ICDR Regulations 2018                                                                  | `[only when: Pre-IPO]`                                                     |

The bail_regular row reads `applicableWhen: "dv_dowry"` in the pack file; the plain words shown for it are "the offence arises from domestic violence or a dowry demand".

## All packs, before and after

Packs in the dump: 92. Packs whose RELATED ACTS line changed: 87. Text is verbatim from the dumps, one block per pack.

### affidavit_identity

Before:

```
RELATED ACTS: Notaries Act, 1952, Bharatiya Nyaya Sanhita (BNS), 2023, Indian Stamp Act, 1899
```

After:

```
RELATED ACTS: Notaries Act, 1952 (S.8), Bharatiya Nyaya Sanhita (BNS), 2023 (S.227; S.228; S.229), Indian Stamp Act, 1899 (Schedule I, Article 4)
```

### affidavit_in_support

Before:

```
RELATED ACTS: Code of Civil Procedure, 1908, Notaries Act, 1952, Bharatiya Sakshya Adhiniyam (BSA), 2023
```

After:

```
RELATED ACTS: Code of Civil Procedure, 1908 (Order XIX; Order XIX Rule 3), Notaries Act, 1952 (S.8), Bharatiya Sakshya Adhiniyam (BSA), 2023 (Schedule)
```

### amendment_of_pleadings

Before:

```
RELATED ACTS: Code of Civil Procedure, 1908, Limitation Act, 1963, Commercial Courts Act, 2015
```

After:

```
RELATED ACTS: Code of Civil Procedure, 1908 (S.151; Order 6 R.17; Order 6 R.17 Proviso; Order 6 R.18; Order 1 R.10; Order 7 R.7; Order 8 R.9), Limitation Act, 1963 (S.21; S.22), Commercial Courts Act, 2015 (Schedule — Order XI)
```

### aoa

Before:

```
RELATED ACTS: Companies Act 2013, Companies (Management and Administration) Rules 2014, Companies (Meetings of Board and its Powers) Rules 2014, Indian Stamp Act 1899
```

After:

```
RELATED ACTS: Companies Act 2013 (S.5; S.6; S.10; S.14; S.96-103; S.149-172; S.173-180; S.123-127; Schedule I Table F), Companies (Management and Administration) Rules 2014, Companies (Meetings of Board and its Powers) Rules 2014, Indian Stamp Act 1899
```

### bail_anticipatory

Before:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023
```

After:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023 (S.482; S.483)
```

### bail_before_magistrate

Before:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023
```

After:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023 (S.478; S.480; S.481; S.482)
```

### bail_cancellation

Before:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023
```

After:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023 (S.480; S.483; S.483(3))
```

### bail_regular

Before:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023, Bharatiya Nyaya Sanhita (BNS), 2023
```

After:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023 (S.478; S.480; S.483; S.484), Bharatiya Nyaya Sanhita (BNS), 2023 (S.85; S.80; S.103(1)), Protection of Women from Domestic Violence Act (PWDVA), 2005 (S.12; S.18; S.19; S.20; S.22) [only when: the offence arises from domestic violence or a dowry demand]
```

### cat_oa

Before:

```
RELATED ACTS: Administrative Tribunals Act, 1985, Central Administrative Tribunal (Procedure) Rules, 1987, Constitution of India (relevant)
```

After:

```
RELATED ACTS: Administrative Tribunals Act, 1985 (S.2; S.14; S.15; S.17; S.19; S.20; S.21; S.22; S.27), Central Administrative Tribunal (Procedure) Rules, 1987 (Rule 4; Rule 6; Rule 13; Rule 14; Rule 24), Constitution of India (relevant) (Article 14; Article 16; Article 309; Article 311; Article 323A)
```

### certiorari

Before:

```
RELATED ACTS: Constitution of India, Statute under which impugned order was passed
```

After:

```
RELATED ACTS: Constitution of India (Article 226; Article 32; Article 227), Statute under which impugned order was passed (As applicable)
```

### condonation_of_delay

Before:

```
RELATED ACTS: Limitation Act, 1963, Code of Civil Procedure, 1908
```

After:

```
RELATED ACTS: Limitation Act, 1963 (S.3; S.4; S.5; S.12; S.12(2); S.14; Schedule Art. 116; Schedule Art. 124), Code of Civil Procedure, 1908 (S.96; S.100; S.115; Order 47 R.1)
```

### consumer_complaint

Before:

```
RELATED ACTS: Consumer Protection Act, 2019
```

After:

```
RELATED ACTS: Consumer Protection Act, 2019 (S.2(7); S.2(11); S.2(12); S.34; S.35; S.38; S.39; S.69)
```

### criminal_appeal

Before:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita, 2023 (BNSS), Bharatiya Nyaya Sanhita, 2023 (BNS), Bharatiya Sakshya Adhiniyam, 2023 (BSA), Limitation Act, 1963
```

After:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita, 2023 (BNSS) (S.415; S.416; S.417; S.418; S.419; S.420; S.421; S.422; S.426; S.428; S.430; S.407), Bharatiya Nyaya Sanhita, 2023 (BNS) (Various), Bharatiya Sakshya Adhiniyam, 2023 (BSA) (Various), Limitation Act, 1963 (Schedule Art. 114; Schedule Art. 115; S.12; S.5)
```

### criminal_revision

Before:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita, 2023 (BNSS), Limitation Act, 1963
```

After:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita, 2023 (BNSS) (S.438; S.438(2); S.438(3); S.440; S.441; S.442; S.443; S.528), Limitation Act, 1963 (Schedule Art. 131; S.5)
```

### curative_petition

Before:

```
RELATED ACTS: Constitution of India, Supreme Court Rules, 2013
```

After:

```
RELATED ACTS: Constitution of India (Article 137; Article 142), Supreme Court Rules, 2013 (Order XLVIII)
```

### default_bail

Before:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023
```

After:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023 (S.187(3); S.187; S.480)
```

### discharge_application

Before:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita, 2023 (BNSS), Bharatiya Nyaya Sanhita, 2023 (BNS), Negotiable Instruments Act, 1881
```

After:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita, 2023 (BNSS) (S.250; S.251; S.261; S.262; S.263; S.268; S.438; S.440; S.442), Bharatiya Nyaya Sanhita, 2023 (BNS) (S.85; S.80; S.316(2); S.318(4)), Negotiable Instruments Act, 1881 (S.138; S.141)
```

### distribution_agreement

Before:

```
RELATED ACTS: Indian Contract Act 1872, Sale of Goods Act 1930, Competition Act 2002, Consumer Protection Act 2019, CGST Act 2017, Trade Marks Act 1999, Legal Metrology Act 2009, FEMA 1999, Customs Act 1962, Indian Stamp Act 1899
```

After:

```
RELATED ACTS: Indian Contract Act 1872, Sale of Goods Act 1930, Competition Act 2002 (S.3 (anti-competitive agreements); S.4 (abuse of dominance)), Consumer Protection Act 2019, CGST Act 2017, Trade Marks Act 1999, Legal Metrology Act 2009, FEMA 1999 [only when: Cross-border distributor], Customs Act 1962 [only when: Imported goods], Indian Stamp Act 1899
```

### divorce_hma

Before:

```
RELATED ACTS: Hindu Marriage Act, 1955
```

After:

```
RELATED ACTS: Hindu Marriage Act, 1955 (S.13(1); S.13(1)(i); S.13(1)(ia); S.13(1)(ib); S.13(1)(ii); S.13(1)(iii); S.13(1)(v); S.13(1)(vi); S.13(1)(vii); S.13(2); S.19; S.23)
```

### divorce_mutual_consent

Before:

```
RELATED ACTS: Hindu Marriage Act, 1955, Special Marriage Act, 1954
```

After:

```
RELATED ACTS: Hindu Marriage Act, 1955 (S.13B(1); S.13B(2)), Special Marriage Act, 1954 (S.28)
```

### divorce_sma

Before:

```
RELATED ACTS: Special Marriage Act, 1954
```

After:

```
RELATED ACTS: Special Marriage Act, 1954 (S.27(1); S.27(1)(a); S.27(1)(b); S.27(1)(c); S.27(1)(d); S.27(1)(e); S.27(1)(f); S.27(1)(h); S.27(1A); S.31; S.34)
```

### dv_act_complaint

Before:

```
RELATED ACTS: Protection of Women from Domestic Violence Act, 2005
```

After:

```
RELATED ACTS: Protection of Women from Domestic Violence Act, 2005 (S.2(a); S.2(f); S.2(q); S.2(s); S.3; S.12; S.18; S.19; S.20; S.21; S.22; S.23; S.27; S.28; S.31)
```

### employment_agreement

Before:

```
RELATED ACTS: Indian Contract Act 1872, Code on Wages 2019, Code on Social Security 2020, Industrial Employment (Standing Orders) Act 1946, Industrial Disputes Act 1947, Shops and Commercial Establishments Act, Employees' Provident Funds and Misc Provisions Act 1952, Payment of Gratuity Act 1972, Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act 2013, Maternity Benefit Act 1961, Digital Personal Data Protection Act 2023, Copyright Act 1957, Patents Act 1970
```

After:

```
RELATED ACTS: Indian Contract Act 1872 (S.27 (void non-compete)), Code on Wages 2019, Code on Social Security 2020, Industrial Employment (Standing Orders) Act 1946 [only when: Industrial establishments >= 100 (or 50 in some states)], Industrial Disputes Act 1947 [only when: Workmen], Shops and Commercial Establishments Act, Employees' Provident Funds and Misc Provisions Act 1952, Payment of Gratuity Act 1972, Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act 2013, Maternity Benefit Act 1961, Digital Personal Data Protection Act 2023, Copyright Act 1957 (S.17(c)), Patents Act 1970 (S.6)
```

### fir_quashing

Before:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita, 2023 (BNSS), Bharatiya Nyaya Sanhita, 2023 (BNS), Constitution of India
```

After:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita, 2023 (BNSS) (S.528; S.173; S.174; S.175; S.180; S.193; S.210), Bharatiya Nyaya Sanhita, 2023 (BNS) (S.85; S.80; S.316(2); S.318(4); S.336(1); S.351), Constitution of India (Article 21; Article 226; Article 227)
```

### founders_agreement

Before:

```
RELATED ACTS: Indian Contract Act 1872, Companies Act 2013, Copyright Act 1957, Patents Act 1970, Specific Relief Act 1963, Arbitration and Conciliation Act 1996, Indian Stamp Act 1899
```

After:

```
RELATED ACTS: Indian Contract Act 1872 (S.10, S.23, S.27), Companies Act 2013, Copyright Act 1957 (S.17 (works in course of employment), S.18-19 (assignment)), Patents Act 1970 (S.6 (employer's claim)), Specific Relief Act 1963, Arbitration and Conciliation Act 1996, Indian Stamp Act 1899
```

### franchise_agreement

Before:

```
RELATED ACTS: Indian Contract Act 1872, Trade Marks Act 1999, Copyright Act 1957, Designs Act 2000, Competition Act 2002, Consumer Protection Act 2019, CGST Act 2017, Income Tax Act 1961, FEMA 1999 + FEMA (Current Account Transactions) Rules 2000, Food Safety and Standards Act 2006, Indian Stamp Act 1899
```

After:

```
RELATED ACTS: Indian Contract Act 1872 (S.27), Trade Marks Act 1999 (S.48 (assignment); S.49 (registered user)), Copyright Act 1957, Designs Act 2000, Competition Act 2002, Consumer Protection Act 2019, CGST Act 2017, Income Tax Act 1961 (S.194J), FEMA 1999 + FEMA (Current Account Transactions) Rules 2000 [only when: Cross-border], Food Safety and Standards Act 2006 [only when: Food/F&B franchise], Indian Stamp Act 1899
```

### gift_deed

Before:

```
RELATED ACTS: Transfer of Property Act, 1882, Registration Act, 1908, Indian Stamp Act, 1899 + State Schedules, Income Tax Act, 1961, Hindu Succession Act, 1956, Indian Succession Act, 1925
```

After:

```
RELATED ACTS: Transfer of Property Act, 1882 (S.122; S.123; S.124; S.125; S.126; S.127; S.128; S.129), Registration Act, 1908 (S.17(1)(a); S.23), Indian Stamp Act, 1899 + State Schedules (Article 33 / equivalent), Income Tax Act, 1961 (S.56(2)(x); S.2(41) Explanation), Hindu Succession Act, 1956 (S.6), Indian Succession Act, 1925 (S.191)
```

### gpa

Before:

```
RELATED ACTS: Powers-of-Attorney Act, 1882, Indian Contract Act, 1872, Registration Act, 1908, Indian Stamp Act, 1899 + State Schedules, Notaries Act, 1952, Foreign Exchange Management Act, 1999 (where NRI)
```

After:

```
RELATED ACTS: Powers-of-Attorney Act, 1882 (S.1A; S.2; S.5), Indian Contract Act, 1872 (S.182; S.183-184; S.186-188; S.201; S.202; S.207-208), Registration Act, 1908 (S.17; S.18; S.32(c); S.33), Indian Stamp Act, 1899 + State Schedules (Article 48 / equivalent), Notaries Act, 1952 (S.8), Foreign Exchange Management Act, 1999 (where NRI) (FEMA Regulations)
```

### guardianship_petition

Before:

```
RELATED ACTS: Guardians and Wards Act, 1890, Hindu Minority and Guardianship Act, 1956
```

After:

```
RELATED ACTS: Guardians and Wards Act, 1890 (S.4; S.7; S.8; S.9; S.10; S.11; S.17; S.19; S.25), Hindu Minority and Guardianship Act, 1956 (S.4; S.6; S.8; S.13)
```

### habeas_corpus

Before:

```
RELATED ACTS: Constitution of India, Bharatiya Nagarik Suraksha Sanhita, 2023 (BNSS), National Security Act, 1980 (where preventive detention)
```

After:

```
RELATED ACTS: Constitution of India (Article 21; Article 22; Article 32; Article 226), Bharatiya Nagarik Suraksha Sanhita, 2023 (BNSS) (S.58; S.100; S.35), National Security Act, 1980 (where preventive detention) (S.3; S.8)
```

### ibc_application

Before:

```
RELATED ACTS: Insolvency and Bankruptcy Code, 2016, Insolvency and Bankruptcy (Application to Adjudicating Authority) Rules, 2016, Limitation Act, 1963
```

After:

```
RELATED ACTS: Insolvency and Bankruptcy Code, 2016 (S.4; S.5(7); S.5(8); S.5(20); S.5(21); S.6; S.7; S.8; S.9; S.10; S.14; S.15; S.16; S.60; S.61), Insolvency and Bankruptcy (Application to Adjudicating Authority) Rules, 2016 (Rule 4; Rule 5; Rule 6; Rule 7), Limitation Act, 1963 (Article 137; Section 18)
```

### interim_application

Before:

```
RELATED ACTS: Code of Civil Procedure, 1908, Specific Relief Act, 1963, Supreme Court Rules, 2013, Limitation Act, 1963
```

After:

```
RELATED ACTS: Code of Civil Procedure, 1908 (Order 39 Rules 1, 2, 3; Section 151), Specific Relief Act, 1963 (Section 37), Supreme Court Rules, 2013 (Order XXXIX), Limitation Act, 1963 (Section 5)
```

### interim_bail

Before:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023
```

After:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023 (S.480; S.483; S.528)
```

### itat_appeal

Before:

```
RELATED ACTS: Income-tax Act, 1961, Income-tax Rules, 1962, Income Tax (Appellate Tribunal) Rules, 1963
```

After:

```
RELATED ACTS: Income-tax Act, 1961 (S.246A; S.250; S.252; S.253; S.253(3); S.253(5); S.253(6); S.254; S.254(2A); S.255; S.260A; S.263; S.264), Income-tax Rules, 1962 (Rule 47; Rule 47(2)), Income Tax (Appellate Tribunal) Rules, 1963 (Rule 4; Rule 9; Rule 10; Rule 29; Rule 35A)
```

### joint_development_agreement

Before:

```
RELATED ACTS: Real Estate (Regulation and Development) Act, 2016 (RERA), Transfer of Property Act, 1882, Income Tax Act, 1961, Central Goods and Services Tax Act, 2017, Registration Act, 1908, Indian Stamp Act, 1899 + State Schedules, Consumer Protection Act, 2019, Arbitration and Conciliation Act, 1996
```

After:

```
RELATED ACTS: Real Estate (Regulation and Development) Act, 2016 (RERA) (S.2(zk); S.3; S.4; S.13; S.14; S.18), Transfer of Property Act, 1882 (S.53A), Income Tax Act, 1961 (S.45(5A); S.50C / 56(2)(x); S.194-IC), Central Goods and Services Tax Act, 2017 (Notification 04/2018-CT(R); Notification 06/2019-CT(R); S.9(3)), Registration Act, 1908 (S.17), Indian Stamp Act, 1899 + State Schedules (Article 5 / 23-A / state JDA article), Consumer Protection Act, 2019 (S.2(7)), Arbitration and Conciliation Act, 1996 (S.7)
```

### judicial_separation

Before:

```
RELATED ACTS: Hindu Marriage Act, 1955, Special Marriage Act, 1954
```

After:

```
RELATED ACTS: Hindu Marriage Act, 1955 (S.10(1); S.10(2); S.13(1A)(i); S.23), Special Marriage Act, 1954 (S.23)
```

### lease_deed

Before:

```
RELATED ACTS: Transfer of Property Act, 1882, Registration Act, 1908, Indian Stamp Act, 1899 + State Schedules, Income Tax Act, 1961, State Rent Control Acts, Model Tenancy Act, 2021 (where adopted by State), Arbitration and Conciliation Act, 1996
```

After:

```
RELATED ACTS: Transfer of Property Act, 1882 (S.105; S.106; S.107; S.108; S.109; S.111; S.112; S.113; S.114; S.116; S.117), Registration Act, 1908 (S.17(1)(d); S.49), Indian Stamp Act, 1899 + State Schedules (Article 35 / equivalent), Income Tax Act, 1961 (S.194-I; S.194-IB; S.22-27), State Rent Control Acts (Bihar Buildings (Lease, Rent and Eviction) Control Act, 1982; Jharkhand Building (Lease, Rent and Eviction) Control Act, 2011; UP Regulation of Urban Premises Tenancy Act, 2021; Delhi Rent Control Act, 1958), Model Tenancy Act, 2021 (where adopted by State) (S.4; S.5; S.11), Arbitration and Conciliation Act, 1996 (S.7; S.11)
```

### legal_notice_breach_of_contract

Before:

```
RELATED ACTS: Indian Contract Act, 1872, Specific Relief Act, 1963, Arbitration & Conciliation Act, 1996, Limitation Act, 1963
```

After:

```
RELATED ACTS: Indian Contract Act, 1872 (S.37; S.39; S.73; S.74; S.75), Specific Relief Act, 1963 (S.10; S.14; S.16; S.20), Arbitration & Conciliation Act, 1996 (S.21), Limitation Act, 1963 (Article 54; Article 55)
```

### legal_notice_consumer_deficiency

Before:

```
RELATED ACTS: Consumer Protection Act, 2019, Consumer Protection (Jurisdiction of the District Commission, the State Commission and the National Commission) Rules, 2021, Consumer Protection (Consumer Commission Procedure) Regulations, 2020, Consumer Protection (E-Commerce) Rules, 2020
```

After:

```
RELATED ACTS: Consumer Protection Act, 2019 (S.2(6); S.2(7); S.2(10); S.2(11); S.2(47); S.17; S.34; S.35; S.39; S.47; S.58; S.69; S.82-87), Consumer Protection (Jurisdiction of the District Commission, the State Commission and the National Commission) Rules, 2021 (Rule 3; Rule 4; Rule 5), Consumer Protection (Consumer Commission Procedure) Regulations, 2020 (Regulation 7), Consumer Protection (E-Commerce) Rules, 2020 (Rule 4 & 5)
```

### legal_notice_copyright_infringement

Before:

```
RELATED ACTS: Copyright Act, 1957, Information Technology Act, 2000, IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, Commercial Courts Act, 2015
```

After:

```
RELATED ACTS: Copyright Act, 1957 (S.13; S.14; S.17; S.18; S.30; S.51; S.52; S.55; S.58; S.62; S.63; S.63B; S.65A; S.65B), Information Technology Act, 2000 (S.79), IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021 (Rule 3(2)(b)), Commercial Courts Act, 2015 (S.12A)
```

### legal_notice_defamation

Before:

```
RELATED ACTS: Bharatiya Nyaya Sanhita, 2023, Bharatiya Nagarik Suraksha Sanhita, 2023, Law of Torts (Common Law), Limitation Act, 1963, Information Technology Act, 2000
```

After:

```
RELATED ACTS: Bharatiya Nyaya Sanhita, 2023 (S.356(1); S.356(2)), Bharatiya Nagarik Suraksha Sanhita, 2023 (S.223), Law of Torts (Common Law), Limitation Act, 1963 (Article 75; Article 76), Information Technology Act, 2000 (S.79)
```

### legal_notice_eviction

Before:

```
RELATED ACTS: Transfer of Property Act, 1882, Specific Relief Act, 1963, State Rent Control Legislation (varies), Code of Civil Procedure, 1908, Limitation Act, 1963
```

After:

```
RELATED ACTS: Transfer of Property Act, 1882 (S.106; S.111; S.114), Specific Relief Act, 1963 (S.6), State Rent Control Legislation (varies), Code of Civil Procedure, 1908 (Order VII Rule 1), Limitation Act, 1963 (Article 65; Article 67)
```

### legal_notice_s138

Before:

```
RELATED ACTS: Negotiable Instruments Act, 1881
```

After:

```
RELATED ACTS: Negotiable Instruments Act, 1881 (S.138; S.141; S.142; S.143; S.144)
```

### legal_notice_s80

Before:

```
RELATED ACTS: Code of Civil Procedure, 1908
```

After:

```
RELATED ACTS: Code of Civil Procedure, 1908 (S.80)
```

### legal_notice_trademark_infringement

Before:

```
RELATED ACTS: Trade Marks Act, 1999, Code of Civil Procedure, 1908, Information Technology Act, 2000, Commercial Courts Act, 2015
```

After:

```
RELATED ACTS: Trade Marks Act, 1999 (S.28; S.29; S.30; S.103; S.104; S.105; S.134; S.135), Code of Civil Procedure, 1908 (Order XXXIX Rules 1 & 2; Order XXXIX Rule 3), Information Technology Act, 2000 (S.79), Commercial Courts Act, 2015 (S.12A)
```

### license_agreement

Before:

```
RELATED ACTS: Indian Easements Act, 1882, Transfer of Property Act, 1882, Indian Stamp Act, 1899 + State Schedules, Income Tax Act, 1961, Central Goods and Services Tax Act, 2017, Arbitration and Conciliation Act, 1996
```

After:

```
RELATED ACTS: Indian Easements Act, 1882 (S.52; S.53; S.54; S.55; S.56; S.60; S.62; S.63; S.64), Transfer of Property Act, 1882 (S.105 vs S.52 EA), Indian Stamp Act, 1899 + State Schedules (Article 5 / Article 35 / Article 36A (state-specific)), Income Tax Act, 1961 (S.194-I; S.194-IB), Central Goods and Services Tax Act, 2017 (S.9 read with Schedule II), Arbitration and Conciliation Act, 1996 (S.7-11)
```

### loan_agreement

Before:

```
RELATED ACTS: Indian Contract Act 1872, Transfer of Property Act 1882, Indian Stamp Act 1899, Registration Act 1908, Interest Act 1978, Negotiable Instruments Act 1881, Companies Act 2013, SARFAESI Act 2002, Recovery of Debts Due to Banks and Financial Institutions Act 1993, Insolvency and Bankruptcy Code 2016, State Money-Lenders Acts, Income Tax Act 1961, FEMA 1999 + ECB Master Direction
```

After:

```
RELATED ACTS: Indian Contract Act 1872 (S.126-147 (guarantee)), Transfer of Property Act 1882 (S.58-104 (mortgage); S.130 (assignment of actionable claim); S.172-179 (pledge)), Indian Stamp Act 1899 (Article 6 (agreement); Article 40 (mortgage); Article 49 (promissory note)), Registration Act 1908, Interest Act 1978, Negotiable Instruments Act 1881 (S.138 (cheque dishonour)), Companies Act 2013 (S.77 (charge filing); S.179, S.180 (borrowing powers); S.185 (loans to directors)), SARFAESI Act 2002 [only when: Lender is Bank/NBFC], Recovery of Debts Due to Banks and Financial Institutions Act 1993, Insolvency and Bankruptcy Code 2016, State Money-Lenders Acts [only when: Private money-lending business], Income Tax Act 1961 (S.194A (TDS on interest); S.269SS / 269T (no cash loans above 20k)), FEMA 1999 + ECB Master Direction [only when: Foreign lender]
```

### mact_claim

Before:

```
RELATED ACTS: Motor Vehicles Act, 1988, Bharatiya Nyaya Sanhita, 2023 (BNS)
```

After:

```
RELATED ACTS: Motor Vehicles Act, 1988 (S.146; S.147; S.149; S.164; S.166; S.168; S.169; S.170; S.171), Bharatiya Nyaya Sanhita, 2023 (BNS) (S.106(1); S.125; S.125(a); S.125(b); S.281)
```

### maintenance_bnss_144

Before:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023
```

After:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023 (S.144(1); S.144(1) Proviso; S.144(2); S.144(3); S.144(4); S.144(5); S.145; S.146)
```

### mandamus

Before:

```
RELATED ACTS:
```

After:

```
RELATED ACTS: Constitution of India (Article 32; Article 226), Specific Relief Act, 1963 (S.38; S.39)
```

### memo_of_parties

Before:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023, Constitution of India, High Court Rules — state-specific
```

After:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023 (S.528), Constitution of India (Article 226; Article 227), High Court Rules — state-specific (Patna HC Rules; Jharkhand HC Rules; Allahabad HC Rules; Delhi HC Rules)
```

### moa

Before:

```
RELATED ACTS: Companies Act 2013, Companies (Incorporation) Rules 2014, Indian Stamp Act 1899
```

After:

```
RELATED ACTS: Companies Act 2013 (S.3; S.4; S.7; S.8; Schedule I; Schedule III), Companies (Incorporation) Rules 2014 (Rule 8; Rule 9; Rule 12), Indian Stamp Act 1899 (State stamp duty on MOA per Schedule I-A)
```

### mortgage_deed

Before:

```
RELATED ACTS: Transfer of Property Act, 1882, Registration Act, 1908, Indian Stamp Act, 1899 + State Schedules, SARFAESI Act, 2002, Recovery of Debts and Bankruptcy Act, 1993 (RDB Act), Indian Contract Act, 1872
```

After:

```
RELATED ACTS: Transfer of Property Act, 1882 (S.58; S.59; S.60; S.60A; S.60B; S.61; S.62; S.65; S.67; S.67A; S.69; S.83; S.91), Registration Act, 1908 (S.17(1)(b); S.17(2)(xi)), Indian Stamp Act, 1899 + State Schedules (Article 40; Article 6), SARFAESI Act, 2002 (S.13(2); S.13(3A); S.13(4); S.17), Recovery of Debts and Bankruptcy Act, 1993 (RDB Act) (S.19), Indian Contract Act, 1872 (S.23)
```

### mou

Before:

```
RELATED ACTS: Indian Contract Act, 1872, Specific Relief Act, 1963, Indian Stamp Act, 1899 + State Schedules, Arbitration and Conciliation Act, 1996, Information Technology Act, 2000, Competition Act, 2002
```

After:

```
RELATED ACTS: Indian Contract Act, 1872 (S.2; S.10; S.23; S.29), Specific Relief Act, 1963 (S.10-12), Indian Stamp Act, 1899 + State Schedules (Article 5), Arbitration and Conciliation Act, 1996 (S.7; S.8 / S.11), Information Technology Act, 2000 (S.10A), Competition Act, 2002 (S.3)
```

### nda

Before:

```
RELATED ACTS: Indian Contract Act 1872, Specific Relief Act 1963, Information Technology Act 2000, Digital Personal Data Protection Act 2023, Copyright Act 1957, Designs Act 2000, Indian Stamp Act 1899
```

After:

```
RELATED ACTS: Indian Contract Act 1872, Specific Relief Act 1963 (S.36-42 (injunctions)), Information Technology Act 2000 (S.43A, S.72A), Digital Personal Data Protection Act 2023, Copyright Act 1957, Designs Act 2000, Indian Stamp Act 1899
```

### partition_deed

Before:

```
RELATED ACTS: Hindu Succession Act, 1956 (as amended 2005), Hindu Minority and Guardianship Act, 1956, Guardians and Wards Act, 1890, Registration Act, 1908, Indian Stamp Act, 1899 + State Schedules, Income Tax Act, 1961, Code of Civil Procedure, 1908
```

After:

```
RELATED ACTS: Hindu Succession Act, 1956 (as amended 2005) (S.6; S.8; S.15; S.23 (omitted 2005)), Hindu Minority and Guardianship Act, 1956 (S.6; S.8), Guardians and Wards Act, 1890 (S.7; S.29), Registration Act, 1908 (S.17(1)(b); S.23), Indian Stamp Act, 1899 + State Schedules (Article 45), Income Tax Act, 1961 (S.171), Code of Civil Procedure, 1908 (Order 20 Rule 18)
```

### pil

Before:

```
RELATED ACTS: Constitution of India
```

After:

```
RELATED ACTS: Constitution of India (Article 14; Article 19; Article 21; Article 32; Article 38; Article 47; Article 48A; Article 51A(g); Article 226)
```

### plaint_declaration

Before:

```
RELATED ACTS: Specific Relief Act, 1963, Code of Civil Procedure, 1908, Limitation Act, 1963, Court Fees Act, 1870 + state amendments, Suits Valuation Act, 1887
```

After:

```
RELATED ACTS: Specific Relief Act, 1963 (S.34; S.35; S.38), Code of Civil Procedure, 1908 (S.9; S.16; S.20; Order VI R.1-15; Order VII R.1; Order VII R.7; Order VII R.11), Limitation Act, 1963 (Schedule Art. 58; Schedule Art. 65), Court Fees Act, 1870 + state amendments (S.7(iv)(c)), Suits Valuation Act, 1887 (S.3; S.8)
```

### plaint_eviction

Before:

```
RELATED ACTS: Transfer of Property Act, 1882, Code of Civil Procedure, 1908, Limitation Act, 1963, Indian Registration Act, 1908, State Rent Control Acts (cross-reference for exclusion), Court Fees Act, 1870 + state amendments
```

After:

```
RELATED ACTS: Transfer of Property Act, 1882 (S.105; S.106; S.107; S.108; S.111; S.114; S.116), Code of Civil Procedure, 1908 (S.9; S.16; S.34; Order VII R.1, 7; Order XX R.12; Order XV R.5), Limitation Act, 1963 (Schedule Art. 67), Indian Registration Act, 1908 (S.17(1)(d)), State Rent Control Acts (cross-reference for exclusion) (Delhi Rent Control Act 1958 S.3; Maharashtra Rent Control Act 1999 S.3; UP Urban Buildings Act 1972 S.2; Bihar Buildings Control Act 1982 S.4), Court Fees Act, 1870 + state amendments (S.7(xi)(cc))
```

### plaint_injunction

Before:

```
RELATED ACTS: Specific Relief Act, 1963, Code of Civil Procedure, 1908, Limitation Act, 1963, Transfer of Property Act, 1882
```

After:

```
RELATED ACTS: Specific Relief Act, 1963 (S.36; S.37; S.38; S.39; S.40; S.41; S.42), Code of Civil Procedure, 1908 (S.9; S.16; S.151; Order 39 R.1; Order 39 R.2; Order 39 R.3; Order 39 R.4; Order 39 R.2A; Order VII R.1, 7), Limitation Act, 1963 (Schedule Art. 113), Transfer of Property Act, 1882 (S.5; S.55)
```

### plaint_partition

Before:

```
RELATED ACTS: Hindu Succession Act, 1956 (as amended in 2005), Code of Civil Procedure, 1908, Transfer of Property Act, 1882, Partition Act, 1893, Limitation Act, 1963, Court Fees Act, 1870 + state amendments (Bihar, UP, Maharashtra, Delhi)
```

After:

```
RELATED ACTS: Hindu Succession Act, 1956 (as amended in 2005) (S.6; S.8; S.10; S.15; S.30), Code of Civil Procedure, 1908 (S.9; S.16; S.17; Order I R.9; Order VII R.1, 7; Order XX R.18; Order XXVI R.13-14), Transfer of Property Act, 1882 (S.44; S.52), Partition Act, 1893 (S.2; S.3; S.4), Limitation Act, 1963 (Schedule Art. 110; Schedule Art. 65), Court Fees Act, 1870 + state amendments (Bihar, UP, Maharashtra, Delhi) (Schedule II Art. 17(vi); S.7(vi))
```

### plaint_recovery

Before:

```
RELATED ACTS: Code of Civil Procedure, 1908, Limitation Act, 1963, Indian Contract Act, 1872, Negotiable Instruments Act, 1881, Indian Stamp Act, 1899, Commercial Courts Act, 2015, Court Fees Act, 1870 (+ state amendments)
```

After:

```
RELATED ACTS: Code of Civil Procedure, 1908 (S.9; S.15; S.20; S.26; S.34; Order VI R.1-18; Order VI R.15; Order VII R.1; Order VII R.6; Order VII R.7; Order VII R.11; Order VII R.14), Limitation Act, 1963 (S.3; Schedule Art. 19; Schedule Art. 22; Schedule Art. 23; Schedule Art. 34; Schedule Art. 35; Schedule Art. 55), Indian Contract Act, 1872 (S.10; S.25; S.73), Negotiable Instruments Act, 1881 (S.4; S.6; S.80; S.138), Indian Stamp Act, 1899 (S.35), Commercial Courts Act, 2015 (S.2(1)(c); S.6; S.12; S.12A), Court Fees Act, 1870 (+ state amendments) (S.7)
```

### plaint_specific_performance

Before:

```
RELATED ACTS: Specific Relief Act, 1963 (as amended by Act 18 of 2018), Indian Contract Act, 1872, Transfer of Property Act, 1882, Code of Civil Procedure, 1908, Limitation Act, 1963, Commercial Courts Act, 2015, Court Fees Act, 1870 + state amendments
```

After:

```
RELATED ACTS: Specific Relief Act, 1963 (as amended by Act 18 of 2018) (S.10; S.11; S.12; S.13; S.14; S.15; S.16; S.19; S.19A; S.20; S.21; S.22; S.25), Indian Contract Act, 1872 (S.10; S.55; S.73), Transfer of Property Act, 1882 (S.53A; S.54), Code of Civil Procedure, 1908 (S.16; S.20; Order VII R.1, 7; Order XX R.12, 12A; Order XXI R.34), Limitation Act, 1963 (Schedule Art. 54), Commercial Courts Act, 2015 (S.2(1)(c)(vii); S.12A), Court Fees Act, 1870 + state amendments (S.7(x))
```

### posh_complaint

Before:

```
RELATED ACTS: Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013, Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Rules, 2013, Bharatiya Nyaya Sanhita, 2023 (BNS) — where conduct also a crime
```

After:

```
RELATED ACTS: Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013 (S.2(a); S.2(n); S.2(o); S.3; S.4; S.6; S.9; S.10; S.11; S.12; S.13; S.14; S.15; S.16; S.17; S.18; S.19; S.21), Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Rules, 2013 (Rule 6; Rule 7; Rule 8; Rule 9), Bharatiya Nyaya Sanhita, 2023 (BNS) — where conduct also a crime (S.74; S.75; S.76; S.77; S.78; S.79; S.63; S.64)
```

### production_of_documents

Before:

```
RELATED ACTS: Code of Civil Procedure, 1908, Bharatiya Sakshya Adhiniyam, 2023 (replaces Indian Evidence Act, 1872), Commercial Courts Act, 2015, Bankers' Books Evidence Act, 1891
```

After:

```
RELATED ACTS: Code of Civil Procedure, 1908 (S.30; S.151; Order 11 R.1-2; Order 11 R.12; Order 11 R.14; Order 11 R.15-19; Order 11 R.18; Order 11 R.21; Order 16 R.6), Bharatiya Sakshya Adhiniyam, 2023 (replaces Indian Evidence Act, 1872) (S.128; S.129; S.135; S.130; S.132), Commercial Courts Act, 2015 (Schedule Order XI), Bankers' Books Evidence Act, 1891 (S.4; S.6)
```

### quashing_528_bnss

Before:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita, 2023 (BNSS), Bharatiya Nyaya Sanhita, 2023 (BNS), Constitution of India
```

After:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita, 2023 (BNSS) (S.528; S.173; S.174; S.175; S.193; S.210; S.438; S.440; S.442), Bharatiya Nyaya Sanhita, 2023 (BNS) (Various), Constitution of India (Article 226; Article 227; Article 21)
```

### quo_warranto

Before:

```
RELATED ACTS: Constitution of India, Statute creating the public office, Rules of recruitment / Service Rules
```

After:

```
RELATED ACTS: Constitution of India (Article 226; Article 32), Statute creating the public office (As applicable), Rules of recruitment / Service Rules (As applicable)
```

### rcr_petition

Before:

```
RELATED ACTS: Hindu Marriage Act, 1955, Special Marriage Act, 1954
```

After:

```
RELATED ACTS: Hindu Marriage Act, 1955 (S.9; S.13(1A)(ii)), Special Marriage Act, 1954 (S.22; S.27(2))
```

### receiver_appointment

Before:

```
RELATED ACTS: Code of Civil Procedure, 1908, Indian Partnership Act, 1932, Companies Act, 2013, Transfer of Property Act, 1882
```

After:

```
RELATED ACTS: Code of Civil Procedure, 1908 (S.94; S.151; Order 40 R.1; Order 40 R.2; Order 40 R.3; Order 40 R.4; Order 40 R.5), Indian Partnership Act, 1932 (S.44), Companies Act, 2013 (S.241), Transfer of Property Act, 1882 (S.69A)
```

### release_deed

Before:

```
RELATED ACTS: Transfer of Property Act, 1882, Hindu Succession Act, 1956, Registration Act, 1908, Indian Stamp Act, 1899 + State Schedules, Income Tax Act, 1961, Hindu Minority and Guardianship Act, 1956
```

After:

```
RELATED ACTS: Transfer of Property Act, 1882 (S.5; S.44), Hindu Succession Act, 1956 (S.6; S.8 / S.15), Registration Act, 1908 (S.17(1)(b)), Indian Stamp Act, 1899 + State Schedules (Article 55), Income Tax Act, 1961 (S.56(2)(x); S.45-50), Hindu Minority and Guardianship Act, 1956 (S.8)
```

### rent_agreement

Before:

```
RELATED ACTS: Transfer of Property Act, 1882, Registration Act, 1908
```

After:

```
RELATED ACTS: Transfer of Property Act, 1882 (S.105; S.106; S.107; S.108), Registration Act, 1908 (S.17)
```

### replication

Before:

```
RELATED ACTS: Code of Civil Procedure, 1908, Commercial Courts Act, 2015
```

After:

```
RELATED ACTS: Code of Civil Procedure, 1908 (Order VI R.1-18; Order VI R.15; Order VI R.15A; Order VI R.17; Order VIII R.1; Order VIII R.6E; Order VIII R.9; Order VIII R.10), Commercial Courts Act, 2015 (Schedule (CPC amendments))
```

### rera_complaint

Before:

```
RELATED ACTS: Real Estate (Regulation and Development) Act, 2016
```

After:

```
RELATED ACTS: Real Estate (Regulation and Development) Act, 2016 (S.3; S.11; S.12; S.13; S.14; S.18; S.19; S.20; S.31; S.43; S.44; S.58; S.59-72)
```

### review_petition

Before:

```
RELATED ACTS: Code of Civil Procedure, 1908, Constitution of India, Supreme Court Rules, 2013, Bharatiya Nagarik Suraksha Sanhita, 2023 (BNSS), Limitation Act, 1963
```

After:

```
RELATED ACTS: Code of Civil Procedure, 1908 (Section 114; Order 47 Rule 1; Order 47 Rule 4), Constitution of India (Article 137; Article 226), Supreme Court Rules, 2013 (Order XLVII), Bharatiya Nagarik Suraksha Sanhita, 2023 (BNSS) (S.403), Limitation Act, 1963 (Article 124 Schedule; Section 5)
```

### sale_deed

Before:

```
RELATED ACTS: Transfer of Property Act, 1882, Registration Act, 1908, Indian Stamp Act, 1899 + State Schedules, Income Tax Act, 1961, State Land / Tenancy Acts, Hindu Succession Act, 1956, Real Estate (Regulation and Development) Act, 2016 (RERA)
```

After:

```
RELATED ACTS: Transfer of Property Act, 1882 (S.54; S.55; S.7; S.10; S.13), Registration Act, 1908 (S.17; S.23; S.32; S.49), Indian Stamp Act, 1899 + State Schedules (S.3; S.17; S.35; Schedule I-A (State)), Income Tax Act, 1961 (S.50C; S.56(2)(x); S.194-IA; S.269SS / 269T), State Land / Tenancy Acts (Bihar Tenancy Act, 1885; Chotanagpur Tenancy Act, 1908; Santhal Parganas Tenancy Act, 1949; UP Revenue Code, 2006; Delhi Land Reforms Act, 1954), Hindu Succession Act, 1956 (S.6), Real Estate (Regulation and Development) Act, 2016 (RERA) (S.3; S.13; S.14)
```

### service_agreement

Before:

```
RELATED ACTS: Indian Contract Act 1872, CGST Act 2017, Income Tax Act 1961, Copyright Act 1957, Patents Act 1970, Digital Personal Data Protection Act 2023, Information Technology Act 2000, Specific Relief Act 1963, Arbitration and Conciliation Act 1996
```

After:

```
RELATED ACTS: Indian Contract Act 1872, CGST Act 2017, Income Tax Act 1961 (S.194C; S.194J; S.194H), Copyright Act 1957, Patents Act 1970, Digital Personal Data Protection Act 2023, Information Technology Act 2000, Specific Relief Act 1963, Arbitration and Conciliation Act 1996
```

### shareholders_agreement

Before:

```
RELATED ACTS: Companies Act 2013, Indian Contract Act 1872, Specific Relief Act 1963, Arbitration and Conciliation Act 1996, FEMA 1999 + FEMA (NDI) Rules 2019, Income Tax Act 1961, SEBI ICDR Regulations 2018, Indian Stamp Act 1899
```

After:

```
RELATED ACTS: Companies Act 2013, Indian Contract Act 1872 (S.27 (non-compete restriction)), Specific Relief Act 1963 (S.14, S.41 (specific performance bars)), Arbitration and Conciliation Act 1996, FEMA 1999 + FEMA (NDI) Rules 2019 [only when: Foreign investor], Income Tax Act 1961 (S.56(2)(viib), S.79), SEBI ICDR Regulations 2018 [only when: Pre-IPO], Indian Stamp Act 1899
```

### slp

Before:

```
RELATED ACTS: Constitution of India, Supreme Court Rules, 2013, Limitation Act, 1963
```

After:

```
RELATED ACTS: Constitution of India (Article 136; Article 137; Article 142), Supreme Court Rules, 2013 (Order IV; Order XXI; Order XXII), Limitation Act, 1963 (Article 133 Schedule; Section 5; Section 12(2))
```

### spa

Before:

```
RELATED ACTS: Powers-of-Attorney Act, 1882, Indian Contract Act, 1872, Registration Act, 1908, Indian Stamp Act, 1899 + State Schedules, Notaries Act, 1952
```

After:

```
RELATED ACTS: Powers-of-Attorney Act, 1882 (S.1A; S.2), Indian Contract Act, 1872 (S.182-184; S.186-188; S.201-202), Registration Act, 1908 (S.17; S.32(c); S.33), Indian Stamp Act, 1899 + State Schedules (Article 48), Notaries Act, 1952 (S.8)
```

### surrender_application

Before:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023
```

After:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023 (S.480; S.478; S.479)
```

### suspension_of_sentence

Before:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023
```

After:

```
RELATED ACTS: Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023 (S.430; S.431; S.415)
```

### temporary_injunction_o39

Before:

```
RELATED ACTS: Code of Civil Procedure, 1908, Specific Relief Act, 1963, Commercial Courts Act, 2015
```

After:

```
RELATED ACTS: Code of Civil Procedure, 1908 (S.94; S.95; S.151; Order 39 R.1; Order 39 R.2; Order 39 R.2A; Order 39 R.3; Order 39 R.3A; Order 39 R.4), Specific Relief Act, 1963 (S.37; S.41), Commercial Courts Act, 2015 (S.12A)
```

### vakalatnama

Before:

```
RELATED ACTS: Advocates Act, 1961, Bar Council of India Rules, Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023
```

After:

```
RELATED ACTS: Advocates Act, 1961 (S.30), Bar Council of India Rules (Rule 39, Part VI Ch II; Rule 36, Part VI Ch II), Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023 (S.340)
```

### will

Before:

```
RELATED ACTS: Indian Succession Act, 1925, Hindu Succession Act, 1956, Mohammedan Personal Law (Shariat) Application Act, 1937, Registration Act, 1908, Guardians and Wards Act, 1890, Indian Stamp Act, 1899
```

After:

```
RELATED ACTS: Indian Succession Act, 1925 (S.2(h); S.57; S.58; S.59; S.61; S.62; S.63; S.67; S.68; S.70; S.74; S.213; S.222 onwards), Hindu Succession Act, 1956 (S.30), Mohammedan Personal Law (Shariat) Application Act, 1937 (S.2), Registration Act, 1908 (S.18(e); S.40-41), Guardians and Wards Act, 1890 (S.7), Indian Stamp Act, 1899 (Article 49)
```

### writ_petition_civil

Before:

```
RELATED ACTS: Constitution of India
```

After:

```
RELATED ACTS: Constitution of India (Article 14; Article 19; Article 21; Article 226; Article 227; Article 300A)
```

### writ_petition_criminal

Before:

```
RELATED ACTS: Constitution of India, Bharatiya Nagarik Suraksha Sanhita, 2023 (BNSS), Delhi Special Police Establishment Act, 1946
```

After:

```
RELATED ACTS: Constitution of India (Article 14; Article 19; Article 21; Article 22; Article 226), Bharatiya Nagarik Suraksha Sanhita, 2023 (BNSS) (S.35; S.173; S.173(4); S.175(3); S.528), Delhi Special Police Establishment Act, 1946 (S.6)
```

### written_statement

Before:

```
RELATED ACTS: Code of Civil Procedure, 1908, Commercial Courts Act, 2015, Limitation Act, 1963
```

After:

```
RELATED ACTS: Code of Civil Procedure, 1908 (Order VI R.1-18; Order VI R.15; Order VI R.15A; Order VIII R.1; Order VIII R.1A; Order VIII R.2; Order VIII R.3; Order VIII R.4; Order VIII R.5; Order VIII R.6; Order VIII R.6A-6G; Order VIII R.9; Order VIII R.10), Commercial Courts Act, 2015 (Schedule (CPC amendments); S.16), Limitation Act, 1963 (S.3)
```

## Please check

- Nested brackets in one ref: `Indian Contract Act 1872 (S.126-147 (guarantee))` and similar. Is it clear to read?
- Commas inside one ref: founders_agreement `S.10, S.23, S.27`; loan `S.179, S.180`. They sit inside the brackets next to the "; " between refs; please look at whether they read as one ref or several.
- "As applicable" and "Various" are kept verbatim, as in the pack files.
- Bare numbers now print as `S.<n>` (the S. rule above). Please confirm none of them is an Order, Rule or Article.

Ajay ref: pending
