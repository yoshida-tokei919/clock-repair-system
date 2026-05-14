# Customer Numbering and Partner Rules

## Purpose

This document defines the meaning of customer type, partner flags, prefixes, internal repair numbers, and partner reference numbers.

The goal is to prevent future implementation mistakes such as using a fixed `P` prefix for all B2B customers, using `isPartner` as the B2B/B2C source of truth, or confusing Yoshida's repair number with a partner's own management number.

## Source of Truth

`Customer.type` is the source of truth for customer classification.

- `individual` means B2C.
- `business` means B2B.

Do not use `Customer.isPartner` to decide whether a customer is B2B or B2C.

## Customer.prefix

`Customer.prefix` is the prefix used for Yoshida's internal repair inquiry numbers.

For B2C customers:

- The prefix is always `C`.
- Example: `C-001`, `C-002`, `C-003`.

For B2B customers:

- The prefix must be assigned per business partner.
- The prefix must not be hardcoded to `P`.
- The prefix should be short, stable, and recognizable for that partner.
- B2B prefixes should be unique in practice.
- If two business partners would have the same prefix, choose a longer or different prefix such as `TR`, `TK`, or another recognizable code.

Examples:

- `TRUST` -> `T-001`, `T-002`
- `じゅえりー工房` -> `J-001`, `J-002`
- `Brand Ichiban` -> `BR-001`, `BR-002`

If a new B2B customer is registered, the UI must provide a prefix input. The system must not silently assign `P` as a generic B2B prefix.

## Customer.currentSeq

`Customer.currentSeq` stores the latest issued sequence number for that customer record.

It is used to issue the next `Repair.inquiryNumber` for the customer.

Example:

- Customer prefix: `T`
- Current sequence: `2`
- Next repair inquiry number: `T-003`

The sequence is managed per customer record. It is not a global repair count.

The prefix is the visible label used in `Repair.inquiryNumber`. Because duplicate B2B prefixes would create confusing or colliding repair numbers, B2B prefixes must be treated as unique in real operation.

## Customer.isPartner

`Customer.isPartner` is not the source of truth for B2B/B2C classification.

Do not use `isPartner` for:

- B2B/B2C checks
- Prefix numbering eligibility
- Deciding whether to issue `C-001` or `T-001`

`isPartner` may remain for existing compatibility or partner-related screens, but new implementation should primarily use:

- `Customer.type`
- `Customer.prefix`
- `Customer.currentSeq`

B2C customers must not be marked `isPartner: true` just to make prefix numbering work.

## Repair.inquiryNumber

`Repair.inquiryNumber` is Yoshida's internal repair case number.

It is issued from:

- `Customer.prefix`
- `Customer.currentSeq`

Examples:

- B2C customer: `C-001`
- TRUST partner: `T-001`
- じゅえりー工房 partner: `J-001`

`Repair.inquiryNumber` is not the partner's own management number.

## Repair.partnerRef

`Repair.partnerRef` is the partner's own management/reference number.

It is separate from Yoshida's internal repair number.

Examples:

- Yoshida inquiry number: `T-001`
- Partner reference: `A-2026-0514`

`partnerRef` must not be used for prefix numbering. It must not be confused with `Repair.inquiryNumber`.

## UI Rules

For B2B customer registration:

- Show a prefix input field.
- Treat the main customer name as the company name or shop name.
- Allow an optional separate contact person field when needed.
- Do not show wording that implies automatic `P` prefix assignment.

For B2C customer registration:

- Hide or disable the prefix input.
- Use fixed prefix `C`.

General UI rules:

- Use `Customer.type` to switch between B2B and B2C.
- Do not use a "partner" checkbox as the B2B/B2C classifier.
- Do not label `partnerRef` as Yoshida's case number.

## Prohibited

Do not implement any of the following:

- Hardcode B2B prefixes to `P`.
- Set `isPartner: true` on B2C customers to make numbering work.
- Use `isPartner` as the condition for prefix-based inquiry number generation.
- Let B2C customers appear in `/api/partners` partner lists.
- Confuse `Repair.partnerRef` with `Repair.inquiryNumber`.
- Generate Yoshida inquiry numbers from `partnerRef`.

## Future Implementation Notes

When fixing the current implementation, update the code in small steps:

1. Make B2B/B2C branching use `Customer.type`.
2. Make inquiry number generation use `Customer.prefix` and `Customer.currentSeq`.
3. Remove any dependency on `isPartner` for numbering.
4. Stop sending a hardcoded `P` prefix from repair registration.
5. Keep existing data compatibility in mind, but do not carry forward the semantic confusion.
