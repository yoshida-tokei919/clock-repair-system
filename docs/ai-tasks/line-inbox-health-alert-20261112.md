# LINE inbound inbox health monitor

The existing one-minute inbox processor also checks rows already accepted by the webhook. It alerts for waiting rows at 5 minutes, processing rows at 15 minutes, and processed text/image rows after a 2-minute grace period when their exact inbound message or stored image record is missing. Attempt-5 final failures retain the processor's existing alert. The processed scan rotates through bounded ID ranges; `health.status = incomplete` means that the current run did not cover the full history. `unavailable` means the check failed and core processing continued.

This monitor cannot detect events never delivered to the webhook. That requires independent LINE Manager history, which is currently unavailable. Inactivity alone is therefore not evidence of a missing event.
