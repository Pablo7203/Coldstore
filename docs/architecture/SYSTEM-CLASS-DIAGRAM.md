# System UML Class Diagram

This is a **domain and application class diagram** for Grand Pa’s Cold Store, based on its requirements, technical architecture, and implemented database schema. It shows inheritance, associations, composition, service responsibilities, and an external integration.

```mermaid
classDiagram
  direction LR

  class AccountUser {
    <<abstract>>
    +UUID id
    +String fullName
    +String email
    +authenticate()
  }
  class StaffMember {
    +StaffRole role
    +Boolean isActive
    +hasPermission(permission) Boolean
  }
  class Customer {
    +String phone
    +CustomerStatus status
    +updateContact(name, phone)
  }
  AccountUser <|-- StaffMember
  AccountUser <|-- Customer

  class StaffRole {
    <<enumeration>>
    ADMIN
    MANAGER
    CASHIER
    STOCK_ASSISTANT
  }
  class CustomerStatus {
    <<enumeration>>
    ACTIVE
    INACTIVE
  }
  StaffMember --> StaffRole : assigned role
  Customer --> CustomerStatus : has status

  class Category {
    +UUID id
    +String name
    +String slug
    +Boolean isActive
  }
  class Product {
    +UUID id
    +String name
    +String sku
    +Decimal sellingPrice
    +Decimal costPrice
    +Decimal reorderLevel
    +deactivate()
  }
  class InventoryBalance {
    +Decimal quantity
    +updateFromMovement(delta)
  }
  class StockMovement {
    +UUID id
    +MovementType type
    +Decimal quantityDelta
    +String reason
    +DateTime occurredAt
    +record()
  }
  class MovementType {
    <<enumeration>>
    OPENING_STOCK
    RECEIPT
    SALE
    WASTAGE
    DAMAGE
    ADJUSTMENT
    RETURN
    REVERSAL
  }
  Category "1" --> "0..*" Product : classifies
  Product "1" *-- "0..1" InventoryBalance : current stock
  Product "1" *-- "0..*" StockMovement : movement ledger
  StaffMember "0..1" --> "0..*" StockMovement : records
  StockMovement --> MovementType : type

  class Sale {
    +UUID id
    +String receiptNumber
    +SaleStatus status
    +Decimal subtotal
    +Decimal total
    +DateTime occurredAt
    +complete()
  }
  class SaleItem {
    +UUID id
    +String productNameSnapshot
    +Decimal unitPrice
    +Decimal quantity
    +Decimal lineTotal
  }
  class SaleStatus {
    <<enumeration>>
    COMPLETED
    VOIDED
    REVERSED
  }
  StaffMember "1" --> "0..*" Sale : cashier
  Customer "0..1" --> "0..*" Sale : purchases
  Sale "1" *-- "1..*" SaleItem : contains
  Product "1" --> "0..*" SaleItem : sold as
  Sale --> SaleStatus : status

  class Payment {
    <<abstract>>
    +UUID id
    +Decimal amount
    +PaymentStatus status
    +String providerReference
    +process()
  }
  class CashPayment {
    +process()
  }
  class MobileMoneyPayment {
    +String providerReference
    +process()
  }
  class PaystackPayment {
    +String providerReference
    +verifyWithProvider()
  }
  class CreditPayment {
    +markOutstanding()
  }
  Payment <|-- CashPayment
  Payment <|-- MobileMoneyPayment
  Payment <|-- PaystackPayment
  Payment <|-- CreditPayment
  class PaymentStatus {
    <<enumeration>>
    RECORDED
    OUTSTANDING
    REVERSED
  }
  Sale "1" --> "0..1" Payment : settled by
  Payment --> PaymentStatus : status

  class CreditAccount {
    +Decimal creditLimit
    +Decimal currentBalance
    +CreditStatus status
    +availableCredit() Decimal
  }
  class CreditTransaction {
    +UUID id
    +CreditTransactionType type
    +Decimal amount
    +Decimal balanceAfter
    +DateTime occurredAt
    +record()
  }
  class CreditStatus {
    <<enumeration>>
    ACTIVE
    SUSPENDED
  }
  class CreditTransactionType {
    <<enumeration>>
    CREDIT_SALE
    REPAYMENT
    ADJUSTMENT
    REVERSAL
  }
  Customer "1" *-- "0..1" CreditAccount : credit facility
  CreditAccount "1" --> "0..*" CreditTransaction : ledger
  Customer "1" --> "0..*" CreditTransaction : owes / repays
  CreditTransaction "0..1" --> Sale : credit sale
  CreditTransaction "0..1" --> Payment : repayment payment
  StaffMember "0..1" --> "0..*" CreditTransaction : records
  CreditAccount --> CreditStatus : status
  CreditTransaction --> CreditTransactionType : type

  class AuditEvent {
    +Long id
    +String action
    +String entityType
    +UUID entityId
    +DateTime createdAt
  }
  StaffMember "0..1" --> "0..*" AuditEvent : performs

  class SaleService {
    <<service>>
    +completeSale(cart, cashier, customer) Sale
  }
  class InventoryService {
    <<service>>
    +recordMovement(product, type, delta) StockMovement
    +getBalance(product) InventoryBalance
  }
  class PaymentService {
    <<service>>
    +process(payment) Payment
  }
  class CreditService {
    <<service>>
    +recordRepayment(customer, amount) CreditTransaction
    +availableCredit(customer) Decimal
  }
  class AuthorizationService {
    <<service>>
    +hasPermission(staff, permission) Boolean
  }
  class AuditService {
    <<service>>
    +record(actor, action, entity) AuditEvent
  }
  class PaystackGateway {
    <<external integration>>
    +initializePayment(amount)
    +verifyPayment(reference)
  }
  SaleService ..> InventoryService : records stock changes
  SaleService ..> PaymentService : records tender
  SaleService ..> CreditService : checks credit sale
  SaleService ..> AuthorizationService : checks cashier access
  SaleService ..> AuditService : records sale event
  CreditService ..> AuditService : records ledger event
  PaymentService ..> PaystackGateway : online payment verification
```

## How to read the model

- **Inheritance:** `StaffMember` and `Customer` specialize the abstract `AccountUser`. The payment method classes specialize abstract `Payment`.
- **Composition:** a `Sale` owns its `SaleItem` rows; a `CreditAccount` owns its ledger; a `Product` has its stock movement history. Diamonds indicate lifecycle/ownership relationships in the domain model.
- **Associations:** a product belongs to a category, a cashier completes sales, and sales contain product snapshots so historical receipts retain the sold name and price.
- **Services:** service classes show where transaction rules belong: sale completion coordinates payment, inventory, credit, permission, and audit work.

## Implementation mapping and scope

This is a UML **domain/application design**, not a one-to-one database diagram. The deployed schema stores staff profiles and customers in separate tables linked to Supabase `auth.users`; `AccountUser` is their shared domain abstraction. Payment methods are currently represented by one `payments` table and a `payment_method` enum, so the payment subclasses illustrate polymorphic behavior in the class model rather than separate database tables. The `PaystackGateway` class is an architecture integration point; provider verification is planned in a later project phase. The classes and relationships for current inventory, POS sales, customers, and credit reflect the committed migrations through Phase 4.
