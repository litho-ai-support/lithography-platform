# Capability Boundary Examples

These examples are review aids, not additional rules or authorization for an agent to change a boundary. Apply `capability.rules.md` first and use the adoption guide only to propose or implement the smallest shape around a human-approved decision.

## Quick Classification

| Candidate                                                  | Capability?  | Reason                                                                          |
| ---------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------- |
| Stable platform fact or lifecycle                          | Usually      | It remains recognizable without its consumers                                   |
| External provider implementation                           | Usually not  | It normally implements one operation of its owner capability                    |
| Provider with an independent lifecycle and product switch  | Sometimes    | Only when it remains independently recognizable and governed                    |
| Independently controlled queue admission and transport     | Sometimes    | Only when the queue boundary has real runtime state or operating responsibility |
| Report, prefill, projection, or orchestration flow         | Usually not  | It composes facts owned elsewhere                                               |
| Logging, normalization, transaction, or persistence helper | No           | It is horizontal infrastructure rather than a vertical semantic boundary        |
| Consumer of another capability                             | No by itself | A dependency is not ownership                                                   |

After classification, use [Capability Adoption Guide](./capability-plugin-authoring.guide.md) to stop at the smallest required stage.

## Reference Report Negative Example

This generic report case is a compact negative example for future human and agent review.

### Incorrect Boundary

```text
reference.profile (business capability)
        ^
        | dependsOn
reference.report (business capability)
```

`reference.report` only queried profiles, grouped them, and returned a view. It owned no fact, state,
policy, write semantics, or independent lifecycle. Its capability identity was inferred from a
dependency and a call shape.

### Correct Boundary

```text
reference.profile (owner capability)
        ^
        | ordinary owner-facing query
BuildReferenceReportUsecase (composition usecase, no capability id)
```

The profile side owns the fact and query. The report side is ordinary usecase composition. A narrow
typed contract may preserve the horizontal dependency boundary, but does not make the consumer a
capability and does not require runtime dispatch.

### Review Rule

Before adding a capability id, remove its dependencies from the diagram. If the candidate no longer owns a recognizable fact, runtime
resource, product result, policy, or lifecycle, keep it as a usecase/read model/facade instead.
