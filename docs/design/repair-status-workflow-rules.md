# Repair Status Workflow Rules

## Purpose

This document is the source of truth for repair case status transitions.

AI assistants and automation must not casually add, remove, rename, or reinterpret statuses.

## Confirmed Statuses

- `reception`
- `estimating`
- `waiting_for_approval`
- `waiting_parts_unordered`
- `waiting_parts_ordered`
- `parts_ready`
- `waiting_work`
- `working`
- `work_completed`
- `delivered`
- `cancelled`
- `on_hold`

## Reception

Move to `reception` on first save when required data exists.

Required data:

- B2C: customer name
- B2B: business partner name
- Watch: brand name

Set `receivedAt` automatically on first save.

## Estimating

After `reception`, move to `estimating` when at least one estimate or repair line is added.

A labor line or a parts line both count.

## Waiting For Approval

Move to `waiting_for_approval` when the estimate document is sent.

Set `estimateSentAt` at the same time.

## After Customer Approval

Customer approval is the trigger for parts and work branching.

If no required parts exist:

- Move to `waiting_work`.

If required parts exist and at least one required part is unordered:

- Move to `waiting_parts_unordered`.

If required parts exist, all required parts are ordered, and at least one required part is not received:

- Move to `waiting_parts_ordered`.

If required parts exist and either all required parts are received or all required parts are already in stock and no order is required:

- Move to `parts_ready`.

## From Waiting Parts Unordered To Waiting Parts Ordered

Move from `waiting_parts_unordered` to `waiting_parts_ordered` when all required parts are marked ordered.

Ordered can be confirmed by:

- Manual action in the parts order screen
- Order confirmation email detected by n8n and sent to the app API

Business judgment must stay in the app API or service, not in n8n.

## From Waiting Parts Ordered To Parts Ready

Move from `waiting_parts_ordered` to `parts_ready` when all required parts are marked received.

Received must be confirmed after physical item inspection.

Do not confirm received status from email alone.

## From Parts Ready To Waiting Work

The official trigger from `parts_ready` to `waiting_work` is the assigned action in the parts order screen.

Meaning:

- Required parts have been physically placed into the repair item bag.
- The repair is ready for bench work.

Assigned must be confirmed by a human.

Do not fully automate this step.

## Working

Move to `working` when the work start button is pressed.

Set `workStartedAt` at the same time.

## Work Completed

Move to `work_completed` when the work complete button is pressed.

Set `workCompletedAt` at the same time.

Calculate `actualWorkMinutes` from `workStartedAt` and `workCompletedAt`.

This duration data may later be used for scheduling estimates by brand, model, caliber, and work content.

## Delivered

Move to `delivered` when the delivery note is issued.

Set `deliveredAt` at the same time.

## Cancelled

`cancelled` is manual only.

Reason input is recommended.

Do not auto-transition to `cancelled`.

## On Hold

`on_hold` is manual only.

Reason input and next follow-up date are recommended.

Do not auto-transition to `on_hold`.

## n8n Role

n8n is used only for external trigger detection, such as:

- Customer approval by LINE or email
- Order confirmation emails
- Shipping notification emails
- Delivery completed emails

n8n must only notify app APIs about events.

The app API or service must decide status transitions.

## Parts State Confirmation Rules

- `ordered` = confirmed by manual ordering action or order confirmation email
- `received` = confirmed after physical item inspection
- `assigned` = confirmed by a human after placing parts into the repair item bag

## Prohibited

- Do not put business judgment logic in n8n.
- Do not confirm received status from email alone.
- Do not fully automate assigned status.
- Do not move to `waiting_work` before required parts are ready or assigned.
- Do not move to parts waiting or `waiting_work` before customer approval.
- Do not auto-transition to `cancelled` or `on_hold`.
- Do not casually add, remove, rename, or reinterpret confirmed statuses.
