# Policy Input Contracts

Policy must be explicit and testable. This file records the inputs policy
decisions rely on.

## Authority Dimensions

- authenticated actor
- anonymous workspace scope
- service identity
- capability
- resource ownership
- data sensitivity
- approval state
- environment

## Policy Decision Registry

| Decision | Input fields | Allowed result | Denied result | Audit event |
| --- | --- | --- | --- | --- |
| `can_use_pitch_lab` | signed anonymous session cookie, workspace id | allow | issue anonymous session | `pitch_lab_session_checked` |
| `can_read_timeline` | signed anonymous session cookie, workspace id, timeline workspace id | allow | 404 | `pitch_lab_timeline_checked` |
| `can_write_timeline` | signed anonymous session cookie, workspace id, timeline workspace id | allow | 404 or reject | timeline action audit event |
| `can_call_model_service` | server-side app code, configured model base URL, configured secret when required | allow | fail visibly | prediction failure log |

## Rules

- default deny where practical
- frontend visibility is not authorization
- model output is not authority over state transitions
- policy decisions should be logged without leaking secrets
- approval is separate from authorization
- anonymous workspace access is a demo boundary, not an individual user identity
