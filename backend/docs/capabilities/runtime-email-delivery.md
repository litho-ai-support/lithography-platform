# Email Delivery Capability Decision

## `runtime.email-delivery`

Owns email admission, queue transport, sendmail delivery, Worker lifecycle, and delivery health.

It does not own the business outcome that requested an email. The requesting flow decides why an
email is needed; Email Delivery owns whether and how the accepted delivery is operated.

`runtime.async-task` is optional observation rather than a hard prerequisite. Audit failure may reduce
trace quality but must not rewrite an accepted or completed delivery result.

Disabling Email Delivery stops new admission and Worker activation. A disabled Worker must not claim
queued work.
