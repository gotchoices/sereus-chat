# Navigation Spec

Purpose: define navigation structure, deep links, and route options for this **target**.

## Sitemap

- HOME Tab
  - ItemList (root)
  - ItemDetail (push from ItemList)
- SETTINGS Tab
  - UserProfile (push)

## Deep Links

- Scheme: `myapp://`
- Pattern: `myapp://screen/<Route>?variant=<name>&...`

## Route Options

- ItemDetail: title "Item"
- ItemList: title "Items"
- UserProfile: title "Profile"

## Notes

- Keep this spec human-readable and user-observable.
- This spec overrides any AI-generated navigation consolidation.
