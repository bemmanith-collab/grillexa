# Data integrity log

Appended by .github/workflows/data-integrity.yml. Newest entries at the bottom.

---

## 2026-08-03 (run 1, exit 1)

```
Error: no access token available. Please login with 'flyctl auth login'
```

---

## 2026-08-04 (run 2, exit 1)

```
Error: no access token available. Please login with 'flyctl auth login'
```

---

## 2026-08-05 (run 3, exit 1)

```
Error: no access token available. Please login with 'flyctl auth login'
```

---

## 2026-08-06 (run 4, exit 1)

```
Error: no access token available. Please login with 'flyctl auth login'
```

---

## 2026-08-06 (run 5, exit 1)

```
Error: get app: failed to run query ($appName: String!) { appcompact:app(name: $appName) { id internalNumericId name hostname cnameTarget deployed network status appUrl platformVersion organization { id internalNumericId slug paidPlan } postgresAppRole: role { name } } }: Post "https://api.fly.io/graphql": net/http: invalid header field value for "Authorization"
```

---

## 2026-08-06 (run 6, exit 1)

```
Error: get app: failed to run query ($appName: String!) { appcompact:app(name: $appName) { id internalNumericId name hostname cnameTarget deployed network status appUrl platformVersion organization { id internalNumericId slug paidPlan } postgresAppRole: role { name } } }: Post "https://api.fly.io/graphql": net/http: invalid header field value for "Authorization"
```

---

## 2026-08-06 (run 7, exit 1)

```
Error: get app: failed to run query ($appName: String!) { appcompact:app(name: $appName) { id internalNumericId name hostname cnameTarget deployed network status appUrl platformVersion organization { id internalNumericId slug paidPlan } postgresAppRole: role { name } } }: You must be authenticated to view this.
```

---

## 2026-08-06 (run 8, exit 0)

```
Connecting to fdaa:98:810d:a7b:86e:df1b:a4bb:2...
# Integrity check 2026-08-01 to 2026-08-15
Run at 2026-08-06T13:50:07.819Z (business day 2026-08-06, UTC+330m)
0 error(s), 1 warning(s)

[WARN] missing-stores: 156 store-days with no ledger row (67 stores, 2026-08-01..2026-08-05).
    2026-08-01  Arokya Heritage chaitanyapuri (vj)
    2026-08-01  Balaji eggs 
    2026-08-01  Chai bar (vj)
    2026-08-01  Friends tea shop 
    2026-08-01  Ganesh kirana store 
    2026-08-01  Guru krupa Kirana store 
    2026-08-01  KDP KIRANA STORE 
    2026-08-01  Kalpana kirana store
    2026-08-01  Kavitha kirana (vj)
    2026-08-01  Kirrak chai (vj)
    2026-08-01  Lakshmi kirana rock town 
    2026-08-01  Manoj kirana store
    2026-08-01  Maruthi kirana store 
    2026-08-01  Mounika kirana store
    2026-08-01  Munna shop 
    2026-08-01  Narendar medical store
    2026-08-01  Naresh kirana store
    2026-08-01  Ohm Sri sai kirana store 
    2026-08-01  Omkar dairy parlour (vj)
    2026-08-01  Pandu seth kirana (vj)
    2026-08-01  Prasad tea shop 
    2026-08-01  Raghavendra stores sripuram (vj)
    2026-08-01  Raja Rajeshwari 
    2026-08-01  Rajeshwari kirana store
    2026-08-01  Sahasra stationary (vj)
    2026-08-01  Sai baba kirana store 
    2026-08-01  Saraswathi stores
    2026-08-01  Sathya kirana (vj)
    2026-08-01  Shalivahana mart (vj)
    2026-08-01  Siddirameshwara
    2026-08-01  Sree laksmi padmavathi kirana
    2026-08-01  Sri Laxmi kirana NTR nagar
    2026-08-01  Sri Mahalaxmi (R)
    2026-08-01  Sri Raghavendra milk parlour
    2026-08-01  Sri Venkateshwara kirana store
    2026-08-01  Sri laxmi Narasimha kirana store 
    2026-08-01  Sri sai dairy (R)
    2026-08-01  Sri sai kirana store Ranjith 
    2026-08-01  Sri venkata Sai krishna
    2026-08-01  Tea time 
    … and 116 more
[INFO] negative-received: 50 rows have a negative received, fully accounted for by unsold stock going back to HQ that day. This is how a settlement records a return — the gross figure is in the Returned column.
    2026-08-01  Sathyanarayana kirana   Green sprouts   received=-2 sold=2 wastage=0 returnedToHq=2
    2026-08-01  Sathyanarayana kirana   Mixed fruit bowl   received=-1 sold=0 wastage=0 returnedToHq=1
    2026-08-01  Sathyanarayana kirana   Mixed sprouts   received=-2 sold=0 wastage=0 returnedToHq=2
    2026-08-01  Sathyanarayana kirana   Single fruit bowl   received=-1 sold=0 wastage=0 returnedToHq=1
    2026-08-02  Chandra stores (vj)  Banana   received=-5 sold=26 wastage=0 returnedToHq=5
    2026-08-02  Chandra stores (vj)  Green sprouts   received=-5 sold=0 wastage=0 returnedToHq=5
    2026-08-02  Chandra stores (vj)  Mixed sprouts   received=-3 sold=2 wastage=0 returnedToHq=3
    2026-08-02  Mamata kirana (vj)  Green sprouts   received=-2 sold=3 wastage=0 returnedToHq=2
    2026-08-02  Mamata kirana (vj)  Mixed fruit bowl   received=-1 sold=2 wastage=0 returnedToHq=1
    2026-08-02  Mamata kirana (vj)  Mixed sprouts   received=-2 sold=1 wastage=0 returnedToHq=2
    2026-08-02  Manikanta kirana (vj)  Green sprouts   received=-1 sold=9 wastage=0 returnedToHq=1
    2026-08-03  AN milk beauty parlour (vj)  Green sprouts   received=-2 sold=0 wastage=0 returnedToHq=2
    2026-08-03  AN milk beauty parlour (vj)  Mixed fruit bowl   received=-5 sold=4 wastage=0 returnedToHq=5
    2026-08-03  AN milk beauty parlour (vj)  Mixed sprouts   received=-4 sold=1 wastage=0 returnedToHq=4
    2026-08-03  Anjji kirana store   Banana   received=-2 sold=0 wastage=0 returnedToHq=2
    2026-08-03  Anjji kirana store   Green sprouts   received=-5 sold=2 wastage=0 returnedToHq=5
    2026-08-03  Anjji kirana store   Mixed fruit bowl   received=-3 sold=0 wastage=0 returnedToHq=3
    2026-08-03  Anjji kirana store   Mixed sprouts   received=-6 sold=1 wastage=0 returnedToHq=6
    2026-08-03  Boom milk parlour (vj)  Green sprouts   received=-6 sold=3 wastage=0 returnedToHq=11
    2026-08-03  Boom milk parlour (vj)  Mixed fruit bowl   received=-3 sold=1 wastage=0 returnedToHq=5
    2026-08-03  Boom milk parlour (vj)  Mixed sprouts   received=-1 sold=2 wastage=0 returnedToHq=7
    2026-08-03  Harini food mall (vj)  Green sprouts   received=-3 sold=0 wastage=0 returnedToHq=7
    2026-08-03  Harini food mall (vj)  Mixed fruit bowl   received=-2 sold=0 wastage=0 returnedToHq=2
    2026-08-03  Mahalakshmi kirana (vj)  Green sprouts   received=-5 sold=0 wastage=0 returnedToHq=5
    2026-08-03  Mahalakshmi kirana (vj)  Mixed fruit bowl   received=-2 sold=0 wastage=0 returnedToHq=2
    2026-08-03  Mahalakshmi kirana (vj)  Mixed sprouts   received=-3 sold=0 wastage=0 returnedToHq=3
    2026-08-03  Mamata kirana (vj)  Green sprouts   received=-4 sold=0 wastage=0 returnedToHq=7
    2026-08-03  Mamata kirana (vj)  Mixed fruit bowl   received=-2 sold=0 wastage=0 returnedToHq=5
    2026-08-03  Mamata kirana (vj)  Mixed sprouts   received=-3 sold=0 wastage=0 returnedToHq=5
    2026-08-03  Omkar dairy parlour (vj)  Green sprouts   received=-3 sold=0 wastage=0 returnedToHq=3
    2026-08-03  Omkar dairy parlour (vj)  Mixed sprouts   received=-1 sold=0 wastage=0 returnedToHq=1
    2026-08-03  Pushpa kirana (vj)  Mixed fruit bowl   received=-1 sold=3 wastage=0 returnedToHq=1
    2026-08-03  Santoshi mata kirana  Green sprouts   received=-4 sold=1 wastage=0 returnedToHq=9
    2026-08-03  Santoshi mata kirana  Mixed sprouts   received=-3 sold=1 wastage=0 returnedToHq=8
    2026-08-03  Sathya kirana (vj)  Green sprouts   received=-1 sold=0 wastage=0 returnedToHq=4
    2026-08-03  Sri laxmi Narasimha kirana store   Green sprouts   received=-1 sold=0 wastage=0 returnedToHq=4
    2026-08-03  Sri laxmi Narasimha kirana store   Mixed fruit bowl   received=-1 sold=0 wastage=0 returnedToHq=4
    2026-08-03  Vasavi kirana  Green sprouts   received=-2 sold=8 wastage=0 returnedToHq=2
    2026-08-03  Vasavi kirana  Mixed fruit bowl   received=-4 sold=4 wastage=0 returnedToHq=4
    2026-08-03  Vasavi kirana  Mixed sprouts   received=-4 sold=6 wastage=0 returnedToHq=4
    … and 10 more
[INFO] negative-closing: 102 rows have closing < 0. Expected: stock is not booked in before it is billed, so the running balance drifts negative and is not displayed anywhere.
[INFO] negative-movements: No unaccounted-for negative movements and no over-settled consignment items.
[INFO] stale-consignments: Nothing delivered before 2026-07-30 is still unsettled.
[INFO] zero-price: No zero-priced sale lines and no zero-total bills.
```

---

## 2026-08-07 (run 9, exit 0)

```
Connecting to fdaa:98:810d:a7b:86e:df1b:a4bb:2...
# Integrity check 2026-08-01 to 2026-08-15
Run at 2026-08-07T03:29:22.480Z (business day 2026-08-07, UTC+330m)
0 error(s), 1 warning(s)

[WARN] missing-stores: 184 store-days with no ledger row (67 stores, 2026-08-01..2026-08-06).
    2026-08-01  Arokya Heritage chaitanyapuri (vj)
    2026-08-01  Balaji eggs 
    2026-08-01  Chai bar (vj)
    2026-08-01  Friends tea shop 
    2026-08-01  Ganesh kirana store 
    2026-08-01  Guru krupa Kirana store 
    2026-08-01  KDP KIRANA STORE 
    2026-08-01  Kalpana kirana store
    2026-08-01  Kavitha kirana (vj)
    2026-08-01  Kirrak chai (vj)
    2026-08-01  Lakshmi kirana rock town 
    2026-08-01  Manoj kirana store
    2026-08-01  Maruthi kirana store 
    2026-08-01  Mounika kirana store
    2026-08-01  Munna shop 
    2026-08-01  Narendar medical store
    2026-08-01  Naresh kirana store
    2026-08-01  Ohm Sri sai kirana store 
    2026-08-01  Omkar dairy parlour (vj)
    2026-08-01  Pandu seth kirana (vj)
    2026-08-01  Prasad tea shop 
    2026-08-01  Raghavendra stores sripuram (vj)
    2026-08-01  Raja Rajeshwari 
    2026-08-01  Rajeshwari kirana store
    2026-08-01  Sahasra stationary (vj)
    2026-08-01  Sai baba kirana store 
    2026-08-01  Saraswathi stores
    2026-08-01  Sathya kirana (vj)
    2026-08-01  Shalivahana mart (vj)
    2026-08-01  Siddirameshwara
    2026-08-01  Sree laksmi padmavathi kirana
    2026-08-01  Sri Laxmi kirana NTR nagar
    2026-08-01  Sri Mahalaxmi (R)
    2026-08-01  Sri Raghavendra milk parlour
    2026-08-01  Sri Venkateshwara kirana store
    2026-08-01  Sri laxmi Narasimha kirana store 
    2026-08-01  Sri sai dairy (R)
    2026-08-01  Sri sai kirana store Ranjith 
    2026-08-01  Sri venkata Sai krishna
    2026-08-01  Tea time 
    … and 144 more
[INFO] negative-received: 51 rows have a negative received, fully accounted for by unsold stock going back to HQ that day. This is how a settlement records a return — the gross figure is in the Returned column.
    2026-08-01  Sathyanarayana kirana   Green sprouts   received=-2 sold=2 wastage=0 returnedToHq=2
    2026-08-01  Sathyanarayana kirana   Mixed fruit bowl   received=-1 sold=0 wastage=0 returnedToHq=1
    2026-08-01  Sathyanarayana kirana   Mixed sprouts   received=-2 sold=0 wastage=0 returnedToHq=2
    2026-08-01  Sathyanarayana kirana   Single fruit bowl   received=-1 sold=0 wastage=0 returnedToHq=1
    2026-08-02  Chandra stores (vj)  Banana   received=-5 sold=26 wastage=0 returnedToHq=5
    2026-08-02  Chandra stores (vj)  Green sprouts   received=-5 sold=0 wastage=0 returnedToHq=5
    2026-08-02  Chandra stores (vj)  Mixed sprouts   received=-3 sold=2 wastage=0 returnedToHq=3
    2026-08-02  Mamata kirana (vj)  Green sprouts   received=-2 sold=3 wastage=0 returnedToHq=2
    2026-08-02  Mamata kirana (vj)  Mixed fruit bowl   received=-1 sold=2 wastage=0 returnedToHq=1
    2026-08-02  Mamata kirana (vj)  Mixed sprouts   received=-2 sold=1 wastage=0 returnedToHq=2
    2026-08-02  Manikanta kirana (vj)  Green sprouts   received=-1 sold=9 wastage=0 returnedToHq=1
    2026-08-03  AN milk beauty parlour (vj)  Green sprouts   received=-2 sold=0 wastage=0 returnedToHq=2
    2026-08-03  AN milk beauty parlour (vj)  Mixed fruit bowl   received=-5 sold=4 wastage=0 returnedToHq=5
    2026-08-03  AN milk beauty parlour (vj)  Mixed sprouts   received=-4 sold=1 wastage=0 returnedToHq=4
    2026-08-03  Anjji kirana store   Banana   received=-2 sold=0 wastage=0 returnedToHq=2
    2026-08-03  Anjji kirana store   Green sprouts   received=-5 sold=2 wastage=0 returnedToHq=5
    2026-08-03  Anjji kirana store   Mixed fruit bowl   received=-3 sold=0 wastage=0 returnedToHq=3
    2026-08-03  Anjji kirana store   Mixed sprouts   received=-6 sold=1 wastage=0 returnedToHq=6
    2026-08-03  Boom milk parlour (vj)  Green sprouts   received=-6 sold=3 wastage=0 returnedToHq=11
    2026-08-03  Boom milk parlour (vj)  Mixed fruit bowl   received=-3 sold=1 wastage=0 returnedToHq=5
    2026-08-03  Boom milk parlour (vj)  Mixed sprouts   received=-1 sold=2 wastage=0 returnedToHq=7
    2026-08-03  Harini food mall (vj)  Green sprouts   received=-3 sold=0 wastage=0 returnedToHq=7
    2026-08-03  Harini food mall (vj)  Mixed fruit bowl   received=-2 sold=0 wastage=0 returnedToHq=2
    2026-08-03  Mahalakshmi kirana (vj)  Green sprouts   received=-5 sold=0 wastage=0 returnedToHq=5
    2026-08-03  Mahalakshmi kirana (vj)  Mixed fruit bowl   received=-2 sold=0 wastage=0 returnedToHq=2
    2026-08-03  Mahalakshmi kirana (vj)  Mixed sprouts   received=-3 sold=0 wastage=0 returnedToHq=3
    2026-08-03  Mamata kirana (vj)  Green sprouts   received=-4 sold=0 wastage=0 returnedToHq=7
    2026-08-03  Mamata kirana (vj)  Mixed fruit bowl   received=-2 sold=0 wastage=0 returnedToHq=5
    2026-08-03  Mamata kirana (vj)  Mixed sprouts   received=-3 sold=0 wastage=0 returnedToHq=5
    2026-08-03  Omkar dairy parlour (vj)  Green sprouts   received=-3 sold=0 wastage=0 returnedToHq=3
    2026-08-03  Omkar dairy parlour (vj)  Mixed sprouts   received=-1 sold=0 wastage=0 returnedToHq=1
    2026-08-03  Pushpa kirana (vj)  Mixed fruit bowl   received=-1 sold=3 wastage=0 returnedToHq=1
    2026-08-03  Santoshi mata kirana  Green sprouts   received=-4 sold=1 wastage=0 returnedToHq=9
    2026-08-03  Santoshi mata kirana  Mixed sprouts   received=-3 sold=1 wastage=0 returnedToHq=8
    2026-08-03  Sathya kirana (vj)  Green sprouts   received=-1 sold=0 wastage=0 returnedToHq=4
    2026-08-03  Sri laxmi Narasimha kirana store   Green sprouts   received=-1 sold=0 wastage=0 returnedToHq=4
    2026-08-03  Sri laxmi Narasimha kirana store   Mixed fruit bowl   received=-1 sold=0 wastage=0 returnedToHq=4
    2026-08-03  Vasavi kirana  Green sprouts   received=-2 sold=8 wastage=0 returnedToHq=2
    2026-08-03  Vasavi kirana  Mixed fruit bowl   received=-4 sold=4 wastage=0 returnedToHq=4
    2026-08-03  Vasavi kirana  Mixed sprouts   received=-4 sold=6 wastage=0 returnedToHq=4
    … and 11 more
[INFO] negative-closing: 121 rows have closing < 0. Expected: stock is not booked in before it is billed, so the running balance drifts negative and is not displayed anywhere.
[INFO] negative-movements: No unaccounted-for negative movements and no over-settled consignment items.
[INFO] stale-consignments: Nothing delivered before 2026-07-31 is still unsettled.
[INFO] zero-price: No zero-priced sale lines and no zero-total bills.
```
