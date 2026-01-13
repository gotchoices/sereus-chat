# Schema

Data model for Quereus SQL backend. Mock mode uses equivalent JSON fixtures.

## Local (device/cadre scope)

### profile
| Column | Type | Notes |
|--------|------|-------|
| id | text | Single row, device identity |
| name | text | Required |
| email | text | Optional |
| phone | text | Optional |
| notes | text | Optional |
| avatar_uri | text | Local file or blob ref |

## Shared (strand scope)

### strand
| Column | Type | Notes |
|--------|------|-------|
| id | text | Strand identifier |
| created_at | text | ISO timestamp |

### strand_member
| Column | Type | Notes |
|--------|------|-------|
| strand_id | text | FK → strand |
| member_id | text | Participant identity |
| display_name | text | Name shown to us |
| avatar_url | text | Optional |
| role | text | owner, member, viewer |

### message
| Column | Type | Notes |
|--------|------|-------|
| id | text | Message identifier |
| strand_id | text | FK → strand |
| sender_id | text | Who sent it |
| text | text | Message content |
| created_at | text | ISO timestamp |
| status | text | sent, delivered, read |

### attachment
| Column | Type | Notes |
|--------|------|-------|
| id | text | Attachment identifier |
| message_id | text | FK → message |
| type | text | image, video, file, location |
| uri | text | Content reference |
| mime_type | text | Optional |
| name | text | Display name |

### invitation
| Column | Type | Notes |
|--------|------|-------|
| token | text | Invitation token |
| strand_id | text | FK → strand (or null if new) |
| created_by | text | Issuer identity |
| created_at | text | ISO timestamp |
| expires_at | text | Optional expiry |
| accepted_at | text | Null until used |

