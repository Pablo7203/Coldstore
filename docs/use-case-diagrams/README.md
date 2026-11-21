# Role-based use-case diagrams

Five standalone UML use-case diagrams for the application's five user roles. Each diagram places the actor outside the system boundary and connects the actor to the functions available to that role.

| Figure | User role       | Diagram                        |
| ------ | --------------- | ------------------------------ |
| 5.13   | Administrator   | `use-case-administrator.svg`   |
| 5.14   | Manager         | `use-case-manager.svg`         |
| 5.15   | Cashier         | `use-case-cashier.svg`         |
| 5.16   | Stock Assistant | `use-case-stock-assistant.svg` |
| 5.17   | Customer        | `use-case-customer.svg`        |

The diagrams use the project role-permission model and user workflows. Regenerate them with `python scripts/generate_use_case_diagrams.py`.
