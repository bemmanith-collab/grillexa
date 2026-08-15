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

---

## 2026-08-08 (run 10, exit 0)

```
Connecting to fdaa:98:810d:a7b:86e:df1b:a4bb:2...
# Integrity check 2026-08-01 to 2026-08-15
Run at 2026-08-08T02:28:28.976Z (business day 2026-08-08, UTC+330m)
0 error(s), 2 warning(s)

[WARN] missing-stores: 211 store-days with no ledger row (67 stores, 2026-08-01..2026-08-07).
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
    … and 171 more
[INFO] negative-received: 53 rows have a negative received, fully accounted for by unsold stock going back to HQ that day. This is how a settlement records a return — the gross figure is in the Returned column.
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
    … and 13 more
[INFO] negative-closing: 142 rows have closing < 0. Expected: stock is not booked in before it is billed, so the running balance drifts negative and is not displayed anywhere.
[INFO] negative-movements: No unaccounted-for negative movements and no over-settled consignment items.
[WARN] stale-consignments: 14 consignments delivered more than 7 days ago are still unsettled, holding Rs.1555.00 of unreported stock.
    2026-07-31  CN-000053  Guru krupa Kirana store   DELIVERED  Rs.249.00
    2026-07-31  CN-000057  Sai baba kirana store   DELIVERED  Rs.124.00
    2026-07-31  CN-000060  Ohm Sri sai kirana store   DELIVERED  Rs.160.00
    2026-07-31  CN-000030  Vasavi kirana  DELIVERED  Rs.131.00
    2026-07-31  CN-000036  Heritage Krishna Kumari (vj)  PARTIAL_SETTLED  Rs.39.00
    2026-07-31  CN-000033  Santoshi mata kirana  DELIVERED  Rs.129.00
    2026-07-31  CN-000046  Venkateshwara juice centre   PARTIAL_SETTLED  Rs.64.00
    2026-07-31  CN-000039  Anjji kirana store   PARTIAL_SETTLED  Rs.75.00
    2026-07-31  CN-000040  Anjji kirana store   DELIVERED  Rs.175.00
    2026-07-31  CN-000041  Rajeshwari kirana store  DELIVERED  Rs.307.00
    2026-07-31  CN-000048  Mahalakshmi kirana (vj)  PARTIAL_SETTLED  Rs.24.00
    2026-07-31  CN-000037  Chandra stores (vj)  PARTIAL_SETTLED  Rs.30.00
    2026-07-31  CN-000050  Dwarakamai kirana (vj)  PARTIAL_SETTLED  Rs.16.00
    2026-07-31  CN-000045  Lakshmi pharmacy (vj)  PARTIAL_SETTLED  Rs.32.00
[INFO] zero-price: No zero-priced sale lines and no zero-total bills.
```

---

## 2026-08-09 (run 11, exit 0)

```
Connecting to fdaa:98:810d:a7b:86e:df1b:a4bb:2...
# Integrity check 2026-08-01 to 2026-08-15
Run at 2026-08-09T02:35:58.511Z (business day 2026-08-09, UTC+330m)
0 error(s), 2 warning(s)

[WARN] missing-stores: 256 store-days with no ledger row (69 stores, 2026-08-01..2026-08-08).
    2026-08-01  Arokya Heritage chaitanyapuri (vj)
    2026-08-01  Babai Pävan sai
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
    2026-08-01  Sri Veda tea stall
    2026-08-01  Sri Venkateshwara kirana store
    2026-08-01  Sri laxmi Narasimha kirana store 
    2026-08-01  Sri sai dairy (R)
    2026-08-01  Sri sai kirana store Ranjith 
    … and 216 more
[INFO] negative-received: 57 rows have a negative received, fully accounted for by unsold stock going back to HQ that day. This is how a settlement records a return — the gross figure is in the Returned column.
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
    … and 17 more
[INFO] negative-closing: 169 rows have closing < 0. Expected: stock is not booked in before it is billed, so the running balance drifts negative and is not displayed anywhere.
[INFO] negative-movements: No unaccounted-for negative movements and no over-settled consignment items.
[WARN] stale-consignments: 26 consignments delivered more than 7 days ago are still unsettled, holding Rs.2528.00 of unreported stock.
    2026-07-31  CN-000053  Guru krupa Kirana store   DELIVERED  Rs.249.00
    2026-07-31  CN-000057  Sai baba kirana store   DELIVERED  Rs.124.00
    2026-07-31  CN-000060  Ohm Sri sai kirana store   DELIVERED  Rs.160.00
    2026-07-31  CN-000030  Vasavi kirana  DELIVERED  Rs.131.00
    2026-07-31  CN-000036  Heritage Krishna Kumari (vj)  PARTIAL_SETTLED  Rs.39.00
    2026-07-31  CN-000033  Santoshi mata kirana  DELIVERED  Rs.129.00
    2026-07-31  CN-000046  Venkateshwara juice centre   PARTIAL_SETTLED  Rs.64.00
    2026-07-31  CN-000039  Anjji kirana store   PARTIAL_SETTLED  Rs.75.00
    2026-07-31  CN-000040  Anjji kirana store   DELIVERED  Rs.175.00
    2026-07-31  CN-000041  Rajeshwari kirana store  DELIVERED  Rs.307.00
    2026-07-31  CN-000048  Mahalakshmi kirana (vj)  PARTIAL_SETTLED  Rs.24.00
    2026-07-31  CN-000037  Chandra stores (vj)  PARTIAL_SETTLED  Rs.30.00
    2026-07-31  CN-000050  Dwarakamai kirana (vj)  PARTIAL_SETTLED  Rs.16.00
    2026-07-31  CN-000045  Lakshmi pharmacy (vj)  PARTIAL_SETTLED  Rs.32.00
    2026-08-01  CN-000069  AN milk beauty parlour (vj)  DELIVERED  Rs.127.00
    2026-08-01  CN-000070  Sri Balaji kg kirana  PARTIAL_SETTLED  Rs.37.00
    2026-08-01  CN-000073  Venkateshwara juice centre   DELIVERED  Rs.77.00
    2026-08-01  CN-000064  Venkateshwara juice centre   PARTIAL_SETTLED  Rs.61.00
    2026-08-01  CN-000071  Rk kirana (vj)  PARTIAL_SETTLED  Rs.67.00
    2026-08-01  CN-000074  Dwarakamai kirana (vj)  PARTIAL_SETTLED  Rs.24.00
    2026-08-01  CN-000075  Santoshi mata kirana  PARTIAL_SETTLED  Rs.80.00
    2026-08-01  CN-000077  Masqati dairy parlour (vj)  DELIVERED  Rs.207.00
    2026-08-01  CN-000078  Anjji kirana store   DELIVERED  Rs.48.00
    2026-08-01  CN-000076  Lakshmi pharmacy (vj)  PARTIAL_SETTLED  Rs.72.00
    2026-08-01  CN-000080  Harini food mall (vj)  DELIVERED  Rs.48.00
    2026-08-01  CN-000072  Mahalakshmi kirana (vj)  DELIVERED  Rs.125.00
[INFO] zero-price: No zero-priced sale lines and no zero-total bills.
```

---

## 2026-08-10 (run 12, exit 0)

```
Connecting to fdaa:98:810d:a7b:86e:df1b:a4bb:2...
# Integrity check 2026-08-01 to 2026-08-15
Run at 2026-08-10T02:41:33.444Z (business day 2026-08-10, UTC+330m)
0 error(s), 2 warning(s)

[WARN] missing-stores: 364 store-days with no ledger row (78 stores, 2026-08-01..2026-08-09).
    2026-08-01  Aj cafe
    2026-08-01  Alekya tea point 
    2026-08-01  Arokya Heritage chaitanyapuri (vj)
    2026-08-01  Babai Pävan sai
    2026-08-01  Balaji eggs 
    2026-08-01  Bhagya lakshmi
    2026-08-01  Chai bar (vj)
    2026-08-01  Friends tea shop 
    2026-08-01  Ganapathi store
    2026-08-01  Ganesh kirana store 
    2026-08-01  Guru krupa Kirana store 
    2026-08-01  KDP KIRANA STORE 
    2026-08-01  Kalpana kirana store
    2026-08-01  Kavitha kirana (vj)
    2026-08-01  Kirrak chai (vj)
    2026-08-01  Laddu Anna  chai
    2026-08-01  Lakshmi kirana rock town 
    2026-08-01  Manjunadha
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
    … and 324 more
[INFO] negative-received: 60 rows have a negative received, fully accounted for by unsold stock going back to HQ that day. This is how a settlement records a return — the gross figure is in the Returned column.
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
    … and 20 more
[INFO] negative-closing: 213 rows have closing < 0. Expected: stock is not booked in before it is billed, so the running balance drifts negative and is not displayed anywhere.
[INFO] negative-movements: No unaccounted-for negative movements and no over-settled consignment items.
[WARN] stale-consignments: 37 consignments delivered more than 7 days ago are still unsettled, holding Rs.3315.00 of unreported stock.
    2026-07-31  CN-000053  Guru krupa Kirana store   DELIVERED  Rs.249.00
    2026-07-31  CN-000060  Ohm Sri sai kirana store   DELIVERED  Rs.160.00
    2026-07-31  CN-000030  Vasavi kirana  DELIVERED  Rs.131.00
    2026-07-31  CN-000036  Heritage Krishna Kumari (vj)  PARTIAL_SETTLED  Rs.39.00
    2026-07-31  CN-000033  Santoshi mata kirana  DELIVERED  Rs.129.00
    2026-07-31  CN-000046  Venkateshwara juice centre   PARTIAL_SETTLED  Rs.64.00
    2026-07-31  CN-000039  Anjji kirana store   PARTIAL_SETTLED  Rs.75.00
    2026-07-31  CN-000040  Anjji kirana store   DELIVERED  Rs.175.00
    2026-07-31  CN-000041  Rajeshwari kirana store  DELIVERED  Rs.307.00
    2026-07-31  CN-000048  Mahalakshmi kirana (vj)  PARTIAL_SETTLED  Rs.24.00
    2026-07-31  CN-000037  Chandra stores (vj)  PARTIAL_SETTLED  Rs.30.00
    2026-07-31  CN-000050  Dwarakamai kirana (vj)  PARTIAL_SETTLED  Rs.16.00
    2026-07-31  CN-000045  Lakshmi pharmacy (vj)  PARTIAL_SETTLED  Rs.32.00
    2026-08-01  CN-000080  Harini food mall (vj)  DELIVERED  Rs.48.00
    2026-08-01  CN-000069  AN milk beauty parlour (vj)  DELIVERED  Rs.127.00
    2026-08-01  CN-000072  Mahalakshmi kirana (vj)  DELIVERED  Rs.125.00
    2026-08-01  CN-000073  Venkateshwara juice centre   DELIVERED  Rs.77.00
    2026-08-01  CN-000070  Sri Balaji kg kirana  PARTIAL_SETTLED  Rs.37.00
    2026-08-01  CN-000074  Dwarakamai kirana (vj)  PARTIAL_SETTLED  Rs.24.00
    2026-08-01  CN-000075  Santoshi mata kirana  PARTIAL_SETTLED  Rs.80.00
    2026-08-01  CN-000071  Rk kirana (vj)  PARTIAL_SETTLED  Rs.67.00
    2026-08-01  CN-000064  Venkateshwara juice centre   PARTIAL_SETTLED  Rs.61.00
    2026-08-01  CN-000077  Masqati dairy parlour (vj)  DELIVERED  Rs.207.00
    2026-08-01  CN-000076  Lakshmi pharmacy (vj)  PARTIAL_SETTLED  Rs.72.00
    2026-08-01  CN-000078  Anjji kirana store   DELIVERED  Rs.48.00
    2026-08-02  CN-000094  Masqati dairy parlour (vj)  PARTIAL_SETTLED  Rs.40.00
    2026-08-02  CN-000084  National kirana (vj)  PARTIAL_SETTLED  Rs.64.00
    2026-08-02  CN-000086  Mahalakshmi kirana (vj)  DELIVERED  Rs.138.00
    2026-08-02  CN-000085  Boom milk parlour (vj)  PARTIAL_SETTLED  Rs.148.00
    2026-08-02  CN-000090  Anjji kirana store   DELIVERED  Rs.72.00
    2026-08-02  CN-000095  Dwarakamai kirana (vj)  DELIVERED  Rs.48.00
    2026-08-02  CN-000087  AN milk beauty parlour (vj)  PARTIAL_SETTLED  Rs.32.00
    2026-08-02  CN-000096  Venkateshwara juice centre   PARTIAL_SETTLED  Rs.151.00
    2026-08-02  CN-000088  Sri Balaji kg kirana  PARTIAL_SETTLED  Rs.45.00
    2026-08-02  CN-000091  Sri sai fancy cool drinks  PARTIAL_SETTLED  Rs.32.00
    2026-08-02  CN-000092  Lakshmi pharmacy (vj)  PARTIAL_SETTLED  Rs.80.00
    2026-08-02  CN-000083  Sathyanarayana kirana   PARTIAL_SETTLED  Rs.61.00
[INFO] zero-price: No zero-priced sale lines and no zero-total bills.
```

---

## 2026-08-11 (run 13, exit 0)

```
Connecting to fdaa:98:810d:a7b:86e:df1b:a4bb:2...
# Integrity check 2026-08-01 to 2026-08-15
Run at 2026-08-11T02:35:26.187Z (business day 2026-08-11, UTC+330m)
0 error(s), 2 warning(s)

[WARN] missing-stores: 418 store-days with no ledger row (80 stores, 2026-08-01..2026-08-10).
    2026-08-01  Aj cafe
    2026-08-01  Alekya tea point 
    2026-08-01  Anjanelu
    2026-08-01  Arokya Heritage chaitanyapuri (vj)
    2026-08-01  Babai Pävan sai
    2026-08-01  Balaji eggs 
    2026-08-01  Bhagya lakshmi
    2026-08-01  Chai bar (vj)
    2026-08-01  Friends tea shop 
    2026-08-01  Ganapathi store
    2026-08-01  Ganesh kirana store 
    2026-08-01  Guru krupa Kirana store 
    2026-08-01  KDP KIRANA STORE 
    2026-08-01  Kalpana kirana store
    2026-08-01  Kavitha kirana (vj)
    2026-08-01  Kirrak chai (vj)
    2026-08-01  Laddu Anna  chai
    2026-08-01  Lakshmi kirana rock town 
    2026-08-01  Manjunadha
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
    … and 378 more
[INFO] negative-received: 63 rows have a negative received, fully accounted for by unsold stock going back to HQ that day. This is how a settlement records a return — the gross figure is in the Returned column.
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
    … and 23 more
[INFO] negative-closing: 249 rows have closing < 0. Expected: stock is not booked in before it is billed, so the running balance drifts negative and is not displayed anywhere.
[INFO] negative-movements: No unaccounted-for negative movements and no over-settled consignment items.
[WARN] stale-consignments: 55 consignments delivered more than 7 days ago are still unsettled, holding Rs.4651.00 of unreported stock.
    2026-07-31  CN-000053  Guru krupa Kirana store   DELIVERED  Rs.249.00
    2026-07-31  CN-000060  Ohm Sri sai kirana store   DELIVERED  Rs.160.00
    2026-07-31  CN-000030  Vasavi kirana  DELIVERED  Rs.131.00
    2026-07-31  CN-000036  Heritage Krishna Kumari (vj)  PARTIAL_SETTLED  Rs.39.00
    2026-07-31  CN-000033  Santoshi mata kirana  DELIVERED  Rs.129.00
    2026-07-31  CN-000046  Venkateshwara juice centre   PARTIAL_SETTLED  Rs.64.00
    2026-07-31  CN-000039  Anjji kirana store   PARTIAL_SETTLED  Rs.75.00
    2026-07-31  CN-000040  Anjji kirana store   DELIVERED  Rs.175.00
    2026-07-31  CN-000041  Rajeshwari kirana store  DELIVERED  Rs.307.00
    2026-07-31  CN-000048  Mahalakshmi kirana (vj)  PARTIAL_SETTLED  Rs.24.00
    2026-07-31  CN-000037  Chandra stores (vj)  PARTIAL_SETTLED  Rs.30.00
    2026-07-31  CN-000050  Dwarakamai kirana (vj)  PARTIAL_SETTLED  Rs.16.00
    2026-07-31  CN-000045  Lakshmi pharmacy (vj)  PARTIAL_SETTLED  Rs.32.00
    2026-08-01  CN-000080  Harini food mall (vj)  DELIVERED  Rs.48.00
    2026-08-01  CN-000071  Rk kirana (vj)  PARTIAL_SETTLED  Rs.67.00
    2026-08-01  CN-000069  AN milk beauty parlour (vj)  DELIVERED  Rs.127.00
    2026-08-01  CN-000072  Mahalakshmi kirana (vj)  DELIVERED  Rs.125.00
    2026-08-01  CN-000073  Venkateshwara juice centre   DELIVERED  Rs.77.00
    2026-08-01  CN-000070  Sri Balaji kg kirana  PARTIAL_SETTLED  Rs.37.00
    2026-08-01  CN-000074  Dwarakamai kirana (vj)  PARTIAL_SETTLED  Rs.24.00
    2026-08-01  CN-000075  Santoshi mata kirana  PARTIAL_SETTLED  Rs.80.00
    2026-08-01  CN-000064  Venkateshwara juice centre   PARTIAL_SETTLED  Rs.61.00
    2026-08-01  CN-000077  Masqati dairy parlour (vj)  DELIVERED  Rs.207.00
    2026-08-01  CN-000076  Lakshmi pharmacy (vj)  PARTIAL_SETTLED  Rs.72.00
    2026-08-01  CN-000078  Anjji kirana store   DELIVERED  Rs.48.00
    2026-08-02  CN-000088  Sri Balaji kg kirana  PARTIAL_SETTLED  Rs.45.00
    2026-08-02  CN-000084  National kirana (vj)  PARTIAL_SETTLED  Rs.64.00
    2026-08-02  CN-000086  Mahalakshmi kirana (vj)  DELIVERED  Rs.138.00
    2026-08-02  CN-000085  Boom milk parlour (vj)  PARTIAL_SETTLED  Rs.148.00
    2026-08-02  CN-000090  Anjji kirana store   DELIVERED  Rs.72.00
    2026-08-02  CN-000095  Dwarakamai kirana (vj)  DELIVERED  Rs.48.00
    2026-08-02  CN-000087  AN milk beauty parlour (vj)  PARTIAL_SETTLED  Rs.32.00
    2026-08-02  CN-000096  Venkateshwara juice centre   PARTIAL_SETTLED  Rs.151.00
    2026-08-02  CN-000083  Sathyanarayana kirana   PARTIAL_SETTLED  Rs.61.00
    2026-08-02  CN-000091  Sri sai fancy cool drinks  PARTIAL_SETTLED  Rs.32.00
    2026-08-02  CN-000092  Lakshmi pharmacy (vj)  PARTIAL_SETTLED  Rs.80.00
    2026-08-02  CN-000094  Masqati dairy parlour (vj)  PARTIAL_SETTLED  Rs.40.00
    2026-08-03  CN-000126  Mounika kirana store  PARTIAL_SETTLED  Rs.16.00
    2026-08-03  CN-000111  Chandra stores (vj)  PARTIAL_SETTLED  Rs.85.00
    2026-08-03  CN-000131  Lakshmi pharmacy (vj)  DELIVERED  Rs.112.00
    … and 15 more
[INFO] zero-price: No zero-priced sale lines and no zero-total bills.
```

---

## 2026-08-12 (run 14, exit 0)

```
Connecting to fdaa:98:810d:a7b:86e:df1b:a4bb:2...
# Integrity check 2026-08-01 to 2026-08-15
Run at 2026-08-12T03:04:59.088Z (business day 2026-08-12, UTC+330m)
0 error(s), 2 warning(s)

[WARN] missing-stores: 452 store-days with no ledger row (80 stores, 2026-08-01..2026-08-11).
    2026-08-01  Aj cafe
    2026-08-01  Alekya tea point 
    2026-08-01  Anjanelu
    2026-08-01  Arokya Heritage chaitanyapuri (vj)
    2026-08-01  Babai Pävan sai
    2026-08-01  Balaji eggs 
    2026-08-01  Bhagya lakshmi
    2026-08-01  Chai bar (vj)
    2026-08-01  Friends tea shop 
    2026-08-01  Ganapathi store
    2026-08-01  Ganesh kirana store 
    2026-08-01  Guru krupa Kirana store 
    2026-08-01  KDP KIRANA STORE 
    2026-08-01  Kalpana kirana store
    2026-08-01  Kavitha kirana (vj)
    2026-08-01  Kirrak chai (vj)
    2026-08-01  Laddu Anna  chai
    2026-08-01  Lakshmi kirana rock town 
    2026-08-01  Manjunadha
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
    … and 412 more
[INFO] negative-received: 70 rows have a negative received, fully accounted for by unsold stock going back to HQ that day. This is how a settlement records a return — the gross figure is in the Returned column.
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
    … and 30 more
[INFO] negative-closing: 287 rows have closing < 0. Expected: stock is not booked in before it is billed, so the running balance drifts negative and is not displayed anywhere.
[INFO] negative-movements: No unaccounted-for negative movements and no over-settled consignment items.
[WARN] stale-consignments: 76 consignments delivered more than 7 days ago are still unsettled, holding Rs.6414.00 of unreported stock.
    2026-07-31  CN-000048  Mahalakshmi kirana (vj)  PARTIAL_SETTLED  Rs.24.00
    2026-07-31  CN-000036  Heritage Krishna Kumari (vj)  PARTIAL_SETTLED  Rs.39.00
    2026-07-31  CN-000037  Chandra stores (vj)  PARTIAL_SETTLED  Rs.30.00
    2026-07-31  CN-000033  Santoshi mata kirana  DELIVERED  Rs.129.00
    2026-07-31  CN-000050  Dwarakamai kirana (vj)  PARTIAL_SETTLED  Rs.16.00
    2026-07-31  CN-000045  Lakshmi pharmacy (vj)  PARTIAL_SETTLED  Rs.32.00
    2026-07-31  CN-000046  Venkateshwara juice centre   PARTIAL_SETTLED  Rs.64.00
    2026-07-31  CN-000060  Ohm Sri sai kirana store   DELIVERED  Rs.160.00
    2026-07-31  CN-000030  Vasavi kirana  DELIVERED  Rs.131.00
    2026-07-31  CN-000039  Anjji kirana store   PARTIAL_SETTLED  Rs.75.00
    2026-07-31  CN-000040  Anjji kirana store   DELIVERED  Rs.175.00
    2026-07-31  CN-000053  Guru krupa Kirana store   DELIVERED  Rs.249.00
    2026-07-31  CN-000041  Rajeshwari kirana store  DELIVERED  Rs.307.00
    2026-08-01  CN-000064  Venkateshwara juice centre   PARTIAL_SETTLED  Rs.61.00
    2026-08-01  CN-000074  Dwarakamai kirana (vj)  PARTIAL_SETTLED  Rs.24.00
    2026-08-01  CN-000075  Santoshi mata kirana  PARTIAL_SETTLED  Rs.80.00
    2026-08-01  CN-000076  Lakshmi pharmacy (vj)  PARTIAL_SETTLED  Rs.72.00
    2026-08-01  CN-000069  AN milk beauty parlour (vj)  DELIVERED  Rs.127.00
    2026-08-01  CN-000073  Venkateshwara juice centre   DELIVERED  Rs.77.00
    2026-08-01  CN-000077  Masqati dairy parlour (vj)  DELIVERED  Rs.207.00
    2026-08-01  CN-000078  Anjji kirana store   DELIVERED  Rs.48.00
    2026-08-01  CN-000080  Harini food mall (vj)  DELIVERED  Rs.48.00
    2026-08-01  CN-000072  Mahalakshmi kirana (vj)  DELIVERED  Rs.125.00
    2026-08-01  CN-000070  Sri Balaji kg kirana  PARTIAL_SETTLED  Rs.37.00
    2026-08-01  CN-000071  Rk kirana (vj)  PARTIAL_SETTLED  Rs.67.00
    2026-08-02  CN-000096  Venkateshwara juice centre   PARTIAL_SETTLED  Rs.151.00
    2026-08-02  CN-000084  National kirana (vj)  PARTIAL_SETTLED  Rs.64.00
    2026-08-02  CN-000083  Sathyanarayana kirana   PARTIAL_SETTLED  Rs.61.00
    2026-08-02  CN-000086  Mahalakshmi kirana (vj)  DELIVERED  Rs.138.00
    2026-08-02  CN-000094  Masqati dairy parlour (vj)  PARTIAL_SETTLED  Rs.40.00
    2026-08-02  CN-000085  Boom milk parlour (vj)  PARTIAL_SETTLED  Rs.148.00
    2026-08-02  CN-000090  Anjji kirana store   DELIVERED  Rs.72.00
    2026-08-02  CN-000092  Lakshmi pharmacy (vj)  PARTIAL_SETTLED  Rs.80.00
    2026-08-02  CN-000091  Sri sai fancy cool drinks  PARTIAL_SETTLED  Rs.32.00
    2026-08-02  CN-000095  Dwarakamai kirana (vj)  DELIVERED  Rs.48.00
    2026-08-02  CN-000087  AN milk beauty parlour (vj)  PARTIAL_SETTLED  Rs.32.00
    2026-08-02  CN-000088  Sri Balaji kg kirana  PARTIAL_SETTLED  Rs.45.00
    2026-08-03  CN-000106  National kirana (vj)  PARTIAL_SETTLED  Rs.106.00
    2026-08-03  CN-000101  Venkateshwara juice centre   PARTIAL_SETTLED  Rs.85.00
    2026-08-03  CN-000114  Sri Mahalaxmi (R)  DELIVERED  Rs.162.00
    … and 36 more
[INFO] zero-price: No zero-priced sale lines and no zero-total bills.
```

---

## 2026-08-13 (run 15, exit 0)

```
Connecting to fdaa:98:810d:a7b:86e:df1b:a4bb:2...
# Integrity check 2026-08-01 to 2026-08-15
Run at 2026-08-13T03:08:10.161Z (business day 2026-08-13, UTC+330m)
0 error(s), 2 warning(s)

[WARN] missing-stores: 501 store-days with no ledger row (80 stores, 2026-08-01..2026-08-12).
    2026-08-01  Aj cafe
    2026-08-01  Alekya tea point 
    2026-08-01  Anjanelu
    2026-08-01  Arokya Heritage chaitanyapuri (vj)
    2026-08-01  Babai Pävan sai
    2026-08-01  Balaji eggs 
    2026-08-01  Bhagya lakshmi
    2026-08-01  Chai bar (vj)
    2026-08-01  Friends tea shop 
    2026-08-01  Ganapathi store
    2026-08-01  Ganesh kirana store 
    2026-08-01  Guru krupa Kirana store 
    2026-08-01  KDP KIRANA STORE 
    2026-08-01  Kalpana kirana store
    2026-08-01  Kavitha kirana (vj)
    2026-08-01  Kirrak chai (vj)
    2026-08-01  Laddu Anna  chai
    2026-08-01  Lakshmi kirana rock town 
    2026-08-01  Manjunadha
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
    … and 461 more
[INFO] negative-received: 71 rows have a negative received, fully accounted for by unsold stock going back to HQ that day. This is how a settlement records a return — the gross figure is in the Returned column.
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
    … and 31 more
[INFO] negative-closing: 325 rows have closing < 0. Expected: stock is not booked in before it is billed, so the running balance drifts negative and is not displayed anywhere.
[INFO] negative-movements: No unaccounted-for negative movements and no over-settled consignment items.
[WARN] stale-consignments: 92 consignments delivered more than 7 days ago are still unsettled, holding Rs.7767.00 of unreported stock.
    2026-07-31  CN-000048  Mahalakshmi kirana (vj)  PARTIAL_SETTLED  Rs.24.00
    2026-07-31  CN-000036  Heritage Krishna Kumari (vj)  PARTIAL_SETTLED  Rs.39.00
    2026-07-31  CN-000037  Chandra stores (vj)  PARTIAL_SETTLED  Rs.30.00
    2026-07-31  CN-000033  Santoshi mata kirana  DELIVERED  Rs.129.00
    2026-07-31  CN-000050  Dwarakamai kirana (vj)  PARTIAL_SETTLED  Rs.16.00
    2026-07-31  CN-000045  Lakshmi pharmacy (vj)  PARTIAL_SETTLED  Rs.32.00
    2026-07-31  CN-000046  Venkateshwara juice centre   PARTIAL_SETTLED  Rs.64.00
    2026-07-31  CN-000060  Ohm Sri sai kirana store   DELIVERED  Rs.160.00
    2026-07-31  CN-000030  Vasavi kirana  DELIVERED  Rs.131.00
    2026-07-31  CN-000039  Anjji kirana store   PARTIAL_SETTLED  Rs.75.00
    2026-07-31  CN-000040  Anjji kirana store   DELIVERED  Rs.175.00
    2026-07-31  CN-000053  Guru krupa Kirana store   DELIVERED  Rs.249.00
    2026-07-31  CN-000041  Rajeshwari kirana store  DELIVERED  Rs.307.00
    2026-08-01  CN-000064  Venkateshwara juice centre   PARTIAL_SETTLED  Rs.61.00
    2026-08-01  CN-000074  Dwarakamai kirana (vj)  PARTIAL_SETTLED  Rs.24.00
    2026-08-01  CN-000075  Santoshi mata kirana  PARTIAL_SETTLED  Rs.80.00
    2026-08-01  CN-000076  Lakshmi pharmacy (vj)  PARTIAL_SETTLED  Rs.72.00
    2026-08-01  CN-000069  AN milk beauty parlour (vj)  DELIVERED  Rs.127.00
    2026-08-01  CN-000073  Venkateshwara juice centre   DELIVERED  Rs.77.00
    2026-08-01  CN-000077  Masqati dairy parlour (vj)  DELIVERED  Rs.207.00
    2026-08-01  CN-000078  Anjji kirana store   DELIVERED  Rs.48.00
    2026-08-01  CN-000080  Harini food mall (vj)  DELIVERED  Rs.48.00
    2026-08-01  CN-000072  Mahalakshmi kirana (vj)  DELIVERED  Rs.125.00
    2026-08-01  CN-000070  Sri Balaji kg kirana  PARTIAL_SETTLED  Rs.37.00
    2026-08-01  CN-000071  Rk kirana (vj)  PARTIAL_SETTLED  Rs.67.00
    2026-08-02  CN-000096  Venkateshwara juice centre   PARTIAL_SETTLED  Rs.151.00
    2026-08-02  CN-000084  National kirana (vj)  PARTIAL_SETTLED  Rs.64.00
    2026-08-02  CN-000083  Sathyanarayana kirana   PARTIAL_SETTLED  Rs.61.00
    2026-08-02  CN-000086  Mahalakshmi kirana (vj)  DELIVERED  Rs.138.00
    2026-08-02  CN-000094  Masqati dairy parlour (vj)  PARTIAL_SETTLED  Rs.40.00
    2026-08-02  CN-000085  Boom milk parlour (vj)  PARTIAL_SETTLED  Rs.148.00
    2026-08-02  CN-000090  Anjji kirana store   DELIVERED  Rs.72.00
    2026-08-02  CN-000092  Lakshmi pharmacy (vj)  PARTIAL_SETTLED  Rs.80.00
    2026-08-02  CN-000091  Sri sai fancy cool drinks  PARTIAL_SETTLED  Rs.32.00
    2026-08-02  CN-000095  Dwarakamai kirana (vj)  DELIVERED  Rs.48.00
    2026-08-02  CN-000087  AN milk beauty parlour (vj)  PARTIAL_SETTLED  Rs.32.00
    2026-08-02  CN-000088  Sri Balaji kg kirana  PARTIAL_SETTLED  Rs.45.00
    2026-08-03  CN-000129  Harini food mall (vj)  PARTIAL_SETTLED  Rs.48.00
    2026-08-03  CN-000101  Venkateshwara juice centre   PARTIAL_SETTLED  Rs.85.00
    2026-08-03  CN-000114  Sri Mahalaxmi (R)  DELIVERED  Rs.162.00
    … and 52 more
[INFO] zero-price: No zero-priced sale lines and no zero-total bills.
```

---

## 2026-08-14 (run 16, exit 0)

```
Connecting to fdaa:98:810d:a7b:86e:df1b:a4bb:2...
# Integrity check 2026-08-01 to 2026-08-15
Run at 2026-08-14T03:07:17.741Z (business day 2026-08-14, UTC+330m)
0 error(s), 2 warning(s)

[WARN] missing-stores: 550 store-days with no ledger row (80 stores, 2026-08-01..2026-08-13).
    2026-08-01  Aj cafe
    2026-08-01  Alekya tea point 
    2026-08-01  Anjanelu
    2026-08-01  Arokya Heritage chaitanyapuri (vj)
    2026-08-01  Babai Pävan sai
    2026-08-01  Balaji eggs 
    2026-08-01  Bhagya lakshmi
    2026-08-01  Chai bar (vj)
    2026-08-01  Friends tea shop 
    2026-08-01  Ganapathi store
    2026-08-01  Ganesh kirana store 
    2026-08-01  Guru krupa Kirana store 
    2026-08-01  KDP KIRANA STORE 
    2026-08-01  Kalpana kirana store
    2026-08-01  Kavitha kirana (vj)
    2026-08-01  Kirrak chai (vj)
    2026-08-01  Laddu Anna  chai
    2026-08-01  Lakshmi kirana rock town 
    2026-08-01  Manjunadha
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
    … and 510 more
[INFO] negative-received: 71 rows have a negative received, fully accounted for by unsold stock going back to HQ that day. This is how a settlement records a return — the gross figure is in the Returned column.
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
    … and 31 more
[INFO] negative-closing: 349 rows have closing < 0. Expected: stock is not booked in before it is billed, so the running balance drifts negative and is not displayed anywhere.
[INFO] negative-movements: No unaccounted-for negative movements and no over-settled consignment items.
[WARN] stale-consignments: 114 consignments delivered more than 7 days ago are still unsettled, holding Rs.9033.00 of unreported stock.
    2026-07-31  CN-000048  Mahalakshmi kirana (vj)  PARTIAL_SETTLED  Rs.24.00
    2026-07-31  CN-000036  Heritage Krishna Kumari (vj)  PARTIAL_SETTLED  Rs.39.00
    2026-07-31  CN-000037  Chandra stores (vj)  PARTIAL_SETTLED  Rs.30.00
    2026-07-31  CN-000033  Santoshi mata kirana  DELIVERED  Rs.129.00
    2026-07-31  CN-000050  Dwarakamai kirana (vj)  PARTIAL_SETTLED  Rs.16.00
    2026-07-31  CN-000045  Lakshmi pharmacy (vj)  PARTIAL_SETTLED  Rs.32.00
    2026-07-31  CN-000046  Venkateshwara juice centre   PARTIAL_SETTLED  Rs.64.00
    2026-07-31  CN-000060  Ohm Sri sai kirana store   DELIVERED  Rs.160.00
    2026-07-31  CN-000030  Vasavi kirana  DELIVERED  Rs.131.00
    2026-07-31  CN-000039  Anjji kirana store   PARTIAL_SETTLED  Rs.75.00
    2026-07-31  CN-000040  Anjji kirana store   DELIVERED  Rs.175.00
    2026-07-31  CN-000053  Guru krupa Kirana store   DELIVERED  Rs.249.00
    2026-07-31  CN-000041  Rajeshwari kirana store  DELIVERED  Rs.307.00
    2026-08-01  CN-000064  Venkateshwara juice centre   PARTIAL_SETTLED  Rs.61.00
    2026-08-01  CN-000074  Dwarakamai kirana (vj)  PARTIAL_SETTLED  Rs.24.00
    2026-08-01  CN-000075  Santoshi mata kirana  PARTIAL_SETTLED  Rs.80.00
    2026-08-01  CN-000076  Lakshmi pharmacy (vj)  PARTIAL_SETTLED  Rs.72.00
    2026-08-01  CN-000069  AN milk beauty parlour (vj)  DELIVERED  Rs.127.00
    2026-08-01  CN-000073  Venkateshwara juice centre   DELIVERED  Rs.77.00
    2026-08-01  CN-000077  Masqati dairy parlour (vj)  DELIVERED  Rs.207.00
    2026-08-01  CN-000078  Anjji kirana store   DELIVERED  Rs.48.00
    2026-08-01  CN-000080  Harini food mall (vj)  DELIVERED  Rs.48.00
    2026-08-01  CN-000072  Mahalakshmi kirana (vj)  DELIVERED  Rs.125.00
    2026-08-01  CN-000070  Sri Balaji kg kirana  PARTIAL_SETTLED  Rs.37.00
    2026-08-01  CN-000071  Rk kirana (vj)  PARTIAL_SETTLED  Rs.67.00
    2026-08-02  CN-000096  Venkateshwara juice centre   PARTIAL_SETTLED  Rs.151.00
    2026-08-02  CN-000084  National kirana (vj)  PARTIAL_SETTLED  Rs.64.00
    2026-08-02  CN-000094  Masqati dairy parlour (vj)  PARTIAL_SETTLED  Rs.40.00
    2026-08-02  CN-000086  Mahalakshmi kirana (vj)  DELIVERED  Rs.138.00
    2026-08-02  CN-000083  Sathyanarayana kirana   PARTIAL_SETTLED  Rs.61.00
    2026-08-02  CN-000085  Boom milk parlour (vj)  PARTIAL_SETTLED  Rs.148.00
    2026-08-02  CN-000090  Anjji kirana store   DELIVERED  Rs.72.00
    2026-08-02  CN-000092  Lakshmi pharmacy (vj)  PARTIAL_SETTLED  Rs.80.00
    2026-08-02  CN-000091  Sri sai fancy cool drinks  PARTIAL_SETTLED  Rs.32.00
    2026-08-02  CN-000095  Dwarakamai kirana (vj)  DELIVERED  Rs.48.00
    2026-08-02  CN-000087  AN milk beauty parlour (vj)  PARTIAL_SETTLED  Rs.32.00
    2026-08-02  CN-000088  Sri Balaji kg kirana  PARTIAL_SETTLED  Rs.45.00
    2026-08-03  CN-000131  Lakshmi pharmacy (vj)  DELIVERED  Rs.112.00
    2026-08-03  CN-000101  Venkateshwara juice centre   PARTIAL_SETTLED  Rs.85.00
    2026-08-03  CN-000114  Sri Mahalaxmi (R)  DELIVERED  Rs.162.00
    … and 74 more
[INFO] zero-price: No zero-priced sale lines and no zero-total bills.
```

---

## 2026-08-15 (run 17, exit 0)

```
Connecting to fdaa:98:810d:a7b:86e:df1b:a4bb:2...
# Integrity check 2026-08-01 to 2026-08-15
Run at 2026-08-15T01:57:39.708Z (business day 2026-08-15, UTC+330m)
0 error(s), 2 warning(s)

[WARN] missing-stores: 603 store-days with no ledger row (80 stores, 2026-08-01..2026-08-14).
    2026-08-01  Aj cafe
    2026-08-01  Alekya tea point 
    2026-08-01  Anjanelu
    2026-08-01  Arokya Heritage chaitanyapuri (vj)
    2026-08-01  Babai Pävan sai
    2026-08-01  Balaji eggs 
    2026-08-01  Bhagya lakshmi
    2026-08-01  Chai bar (vj)
    2026-08-01  Friends tea shop 
    2026-08-01  Ganapathi store
    2026-08-01  Ganesh kirana store 
    2026-08-01  Guru krupa Kirana store 
    2026-08-01  KDP KIRANA STORE 
    2026-08-01  Kalpana kirana store
    2026-08-01  Kavitha kirana (vj)
    2026-08-01  Kirrak chai (vj)
    2026-08-01  Laddu Anna  chai
    2026-08-01  Lakshmi kirana rock town 
    2026-08-01  Manjunadha
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
    … and 563 more
[INFO] negative-received: 71 rows have a negative received, fully accounted for by unsold stock going back to HQ that day. This is how a settlement records a return — the gross figure is in the Returned column.
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
    … and 31 more
[INFO] negative-closing: 376 rows have closing < 0. Expected: stock is not booked in before it is billed, so the running balance drifts negative and is not displayed anywhere.
[INFO] negative-movements: No unaccounted-for negative movements and no over-settled consignment items.
[WARN] stale-consignments: 132 consignments delivered more than 7 days ago are still unsettled, holding Rs.10269.00 of unreported stock.
    2026-07-31  CN-000033  Santoshi mata kirana  DELIVERED  Rs.129.00
    2026-07-31  CN-000037  Chandra stores (vj)  PARTIAL_SETTLED  Rs.30.00
    2026-07-31  CN-000050  Dwarakamai kirana (vj)  PARTIAL_SETTLED  Rs.16.00
    2026-07-31  CN-000040  Anjji kirana store   DELIVERED  Rs.175.00
    2026-07-31  CN-000036  Heritage Krishna Kumari (vj)  PARTIAL_SETTLED  Rs.39.00
    2026-07-31  CN-000030  Vasavi kirana  DELIVERED  Rs.131.00
    2026-07-31  CN-000060  Ohm Sri sai kirana store   DELIVERED  Rs.160.00
    2026-07-31  CN-000053  Guru krupa Kirana store   DELIVERED  Rs.249.00
    2026-07-31  CN-000039  Anjji kirana store   PARTIAL_SETTLED  Rs.75.00
    2026-07-31  CN-000045  Lakshmi pharmacy (vj)  PARTIAL_SETTLED  Rs.32.00
    2026-07-31  CN-000046  Venkateshwara juice centre   PARTIAL_SETTLED  Rs.64.00
    2026-07-31  CN-000041  Rajeshwari kirana store  DELIVERED  Rs.307.00
    2026-07-31  CN-000048  Mahalakshmi kirana (vj)  PARTIAL_SETTLED  Rs.24.00
    2026-08-01  CN-000080  Harini food mall (vj)  DELIVERED  Rs.48.00
    2026-08-01  CN-000076  Lakshmi pharmacy (vj)  PARTIAL_SETTLED  Rs.72.00
    2026-08-01  CN-000069  AN milk beauty parlour (vj)  DELIVERED  Rs.127.00
    2026-08-01  CN-000073  Venkateshwara juice centre   DELIVERED  Rs.77.00
    2026-08-01  CN-000077  Masqati dairy parlour (vj)  DELIVERED  Rs.207.00
    2026-08-01  CN-000078  Anjji kirana store   DELIVERED  Rs.48.00
    2026-08-01  CN-000072  Mahalakshmi kirana (vj)  DELIVERED  Rs.125.00
    2026-08-01  CN-000070  Sri Balaji kg kirana  PARTIAL_SETTLED  Rs.37.00
    2026-08-01  CN-000064  Venkateshwara juice centre   PARTIAL_SETTLED  Rs.61.00
    2026-08-01  CN-000071  Rk kirana (vj)  PARTIAL_SETTLED  Rs.67.00
    2026-08-01  CN-000074  Dwarakamai kirana (vj)  PARTIAL_SETTLED  Rs.24.00
    2026-08-01  CN-000075  Santoshi mata kirana  PARTIAL_SETTLED  Rs.80.00
    2026-08-02  CN-000095  Dwarakamai kirana (vj)  DELIVERED  Rs.48.00
    2026-08-02  CN-000094  Masqati dairy parlour (vj)  PARTIAL_SETTLED  Rs.40.00
    2026-08-02  CN-000087  AN milk beauty parlour (vj)  PARTIAL_SETTLED  Rs.32.00
    2026-08-02  CN-000096  Venkateshwara juice centre   PARTIAL_SETTLED  Rs.151.00
    2026-08-02  CN-000088  Sri Balaji kg kirana  PARTIAL_SETTLED  Rs.45.00
    2026-08-02  CN-000090  Anjji kirana store   DELIVERED  Rs.72.00
    2026-08-02  CN-000086  Mahalakshmi kirana (vj)  DELIVERED  Rs.138.00
    2026-08-02  CN-000085  Boom milk parlour (vj)  PARTIAL_SETTLED  Rs.148.00
    2026-08-02  CN-000091  Sri sai fancy cool drinks  PARTIAL_SETTLED  Rs.32.00
    2026-08-02  CN-000092  Lakshmi pharmacy (vj)  PARTIAL_SETTLED  Rs.80.00
    2026-08-02  CN-000083  Sathyanarayana kirana   PARTIAL_SETTLED  Rs.61.00
    2026-08-02  CN-000084  National kirana (vj)  PARTIAL_SETTLED  Rs.64.00
    2026-08-03  CN-000121  Rk kirana (vj)  PARTIAL_SETTLED  Rs.46.00
    2026-08-03  CN-000111  Chandra stores (vj)  PARTIAL_SETTLED  Rs.85.00
    2026-08-03  CN-000106  National kirana (vj)  PARTIAL_SETTLED  Rs.106.00
    … and 92 more
[INFO] zero-price: No zero-priced sale lines and no zero-total bills.
```
