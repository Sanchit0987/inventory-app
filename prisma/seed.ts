/**
 * Realistic demo data: an electronics & accessories wholesaler with
 * 3 warehouses, 24 products, suppliers, customers, 90 days of order
 * history, and live stock produced by replaying the actual movements.
 */
import { PrismaClient, MovementType } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

function daysAgo(n: number, hourJitter = true) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  if (hourJitter) d.setHours(8 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60));
  return d;
}

// deterministic-ish PRNG so reseeding looks stable
let seedState = 42;
function rand() {
  seedState = (seedState * 1103515245 + 12345) % 2 ** 31;
  return seedState / 2 ** 31;
}
function randInt(min: number, max: number) {
  return min + Math.floor(rand() * (max - min + 1));
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

async function main() {
  console.log("Clearing existing data...");
  await db.$transaction([
    db.activityLog.deleteMany(),
    db.notification.deleteMany(),
    db.invoice.deleteMany(),
    db.salesOrderLine.deleteMany(),
    db.salesOrder.deleteMany(),
    db.purchaseOrderLine.deleteMany(),
    db.purchaseOrder.deleteMany(),
    db.stockTransferLine.deleteMany(),
    db.stockTransfer.deleteMany(),
    db.stockMovement.deleteMany(),
    db.stockLevel.deleteMany(),
    db.productVariant.deleteMany(),
    db.product.deleteMany(),
    db.category.deleteMany(),
    db.customer.deleteMany(),
    db.supplier.deleteMany(),
    db.warehouse.deleteMany(),
    db.taxRate.deleteMany(),
    db.organization.deleteMany(),
    db.user.deleteMany(),
    db.docCounter.deleteMany(),
  ]);

  console.log("Users...");
  const [admin, manager, staff] = await Promise.all([
    db.user.create({
      data: { email: "admin@acme.io", name: "Ava Chen", role: "ADMIN", passwordHash: await bcrypt.hash("admin1234", 10) },
    }),
    db.user.create({
      data: { email: "manager@acme.io", name: "Marcus Reid", role: "MANAGER", passwordHash: await bcrypt.hash("manager1234", 10) },
    }),
    db.user.create({
      data: { email: "staff@acme.io", name: "Sofia Alvarez", role: "STAFF", passwordHash: await bcrypt.hash("staff1234", 10) },
    }),
  ]);

  await db.organization.create({
    data: {
      id: 1, name: "Acme Supply Co.", currency: "USD", currencySymbol: "$",
      timezone: "America/Los_Angeles", address: "500 Harbor Blvd, Oakland, CA",
      businessType: "Wholesale / distribution", onboarded: true,
      units: ["pcs", "box", "kg", "pack"],
    },
  });
  await db.taxRate.createMany({
    data: [
      { name: "Standard (CA)", rate: 8.75, isDefault: true },
      { name: "Reduced", rate: 4.0 },
      { name: "Zero-rated", rate: 0 },
    ],
  });

  console.log("Warehouses...");
  const whMain = await db.warehouse.create({ data: { code: "OAK", name: "Oakland Main", address: "500 Harbor Blvd, Oakland, CA", isPrimary: true } });
  const whEast = await db.warehouse.create({ data: { code: "NJW", name: "Newark East", address: "77 Port St, Newark, NJ" } });
  const whRetail = await db.warehouse.create({ data: { code: "SFR", name: "SF Retail Backroom", address: "210 Market St, San Francisco, CA" } });
  const warehouses = [whMain, whEast, whRetail];

  console.log("Categories & products...");
  const catNames = ["Audio", "Cables & Adapters", "Chargers & Power", "Computer Accessories", "Smart Home", "Storage"];
  const cats = Object.fromEntries(
    await Promise.all(catNames.map(async (name) => [name, await db.category.create({ data: { name } })] as const))
  );

  type P = {
    sku: string; name: string; cat: string; cost: number; price: number; emoji: string;
    reorder: number; unit?: string; barcode?: string;
    variants?: { name: string; sku: string; extraPrice: number }[];
  };
  const productDefs: P[] = [
    { sku: "AUD-WH100", name: "Nimbus Wireless Headphones", cat: "Audio", cost: 42.5, price: 89.99, emoji: "🎧", reorder: 15, barcode: "810001001", variants: [{ name: "Black", sku: "AUD-WH100-BK", extraPrice: 0 }, { name: "White", sku: "AUD-WH100-WH", extraPrice: 0 }, { name: "Midnight Blue", sku: "AUD-WH100-BL", extraPrice: 5 }] },
    { sku: "AUD-EB220", name: "Pulse True-Wireless Earbuds", cat: "Audio", cost: 19.0, price: 49.99, emoji: "🎵", reorder: 25, barcode: "810001002" },
    { sku: "AUD-SPK30", name: "Boulder Bluetooth Speaker", cat: "Audio", cost: 24.0, price: 59.99, emoji: "🔊", reorder: 10, barcode: "810001003" },
    { sku: "AUD-MIC55", name: "Podcaster USB Microphone", cat: "Audio", cost: 38.0, price: 99.99, emoji: "🎙️", reorder: 8, barcode: "810001004" },
    { sku: "CBL-UC1M", name: "USB-C Cable 1m (Braided)", cat: "Cables & Adapters", cost: 2.1, price: 9.99, emoji: "🔌", reorder: 100, barcode: "810002001", variants: [{ name: "1m", sku: "CBL-UC1M-1", extraPrice: 0 }, { name: "2m", sku: "CBL-UC1M-2", extraPrice: 3 }] },
    { sku: "CBL-HD2M", name: "HDMI 2.1 Cable 2m", cat: "Cables & Adapters", cost: 4.5, price: 16.99, emoji: "📺", reorder: 60, barcode: "810002002" },
    { sku: "CBL-MULTI", name: "7-in-1 USB-C Hub", cat: "Cables & Adapters", cost: 14.0, price: 39.99, emoji: "🧩", reorder: 30, barcode: "810002003" },
    { sku: "CBL-AUX", name: "Aux Audio Cable 1.5m", cat: "Cables & Adapters", cost: 1.2, price: 6.99, emoji: "🎚️", reorder: 80, barcode: "810002004" },
    { sku: "PWR-GAN65", name: "65W GaN Wall Charger", cat: "Chargers & Power", cost: 11.5, price: 34.99, emoji: "⚡", reorder: 40, barcode: "810003001" },
    { sku: "PWR-PB20K", name: "20,000mAh Power Bank", cat: "Chargers & Power", cost: 16.0, price: 44.99, emoji: "🔋", reorder: 30, barcode: "810003002" },
    { sku: "PWR-WCP15", name: "15W Wireless Charging Pad", cat: "Chargers & Power", cost: 7.5, price: 24.99, emoji: "📱", reorder: 35, barcode: "810003003" },
    { sku: "PWR-CAR38", name: "38W Dual Car Charger", cat: "Chargers & Power", cost: 5.0, price: 17.99, emoji: "🚗", reorder: 45, barcode: "810003004" },
    { sku: "COM-KB75", name: "Tactile 75% Mechanical Keyboard", cat: "Computer Accessories", cost: 36.0, price: 84.99, emoji: "⌨️", reorder: 12, barcode: "810004001", variants: [{ name: "Brown switches", sku: "COM-KB75-BR", extraPrice: 0 }, { name: "Red switches", sku: "COM-KB75-RD", extraPrice: 0 }] },
    { sku: "COM-MS900", name: "Ergo Wireless Mouse", cat: "Computer Accessories", cost: 13.0, price: 32.99, emoji: "🖱️", reorder: 20, barcode: "810004002" },
    { sku: "COM-WEB4K", name: "4K Streaming Webcam", cat: "Computer Accessories", cost: 29.0, price: 79.99, emoji: "📷", reorder: 10, barcode: "810004003" },
    { sku: "COM-LAP15", name: "Laptop Stand (Aluminum)", cat: "Computer Accessories", cost: 9.5, price: 29.99, emoji: "💻", reorder: 18, barcode: "810004004" },
    { sku: "SMH-PLUG", name: "Smart Plug (2-pack)", cat: "Smart Home", cost: 8.0, price: 22.99, emoji: "🏠", reorder: 30, barcode: "810005001" },
    { sku: "SMH-BULB", name: "RGB Smart Bulb E26", cat: "Smart Home", cost: 4.2, price: 14.99, emoji: "💡", reorder: 50, barcode: "810005002" },
    { sku: "SMH-CAM", name: "Indoor Security Camera", cat: "Smart Home", cost: 18.5, price: 49.99, emoji: "📹", reorder: 15, barcode: "810005003" },
    { sku: "SMH-SENS", name: "Door/Window Sensor Kit", cat: "Smart Home", cost: 6.0, price: 19.99, emoji: "🚪", reorder: 25, barcode: "810005004" },
    { sku: "STO-SSD1T", name: "Portable SSD 1TB", cat: "Storage", cost: 54.0, price: 109.99, emoji: "💾", reorder: 10, barcode: "810006001" },
    { sku: "STO-SD256", name: "SDXC Card 256GB", cat: "Storage", cost: 14.5, price: 32.99, emoji: "🗂️", reorder: 40, barcode: "810006002" },
    { sku: "STO-USB128", name: "USB 3.2 Flash Drive 128GB", cat: "Storage", cost: 6.5, price: 16.99, emoji: "📀", reorder: 60, barcode: "810006003" },
    { sku: "STO-NVME2", name: "NVMe Enclosure USB-C", cat: "Storage", cost: 11.0, price: 27.99, emoji: "🖥️", reorder: 20, barcode: "810006004" },
  ];

  const products: { id: string; sku: string; name: string; cost: number; price: number; reorder: number }[] = [];
  for (const p of productDefs) {
    const created = await db.product.create({
      data: {
        sku: p.sku, name: p.name, barcode: p.barcode ?? null, imageEmoji: p.emoji,
        categoryId: cats[p.cat].id, costPrice: p.cost, sellingPrice: p.price,
        taxRatePct: 8.75, unit: p.unit ?? "pcs", reorderPoint: p.reorder,
        description: `${p.name} — demo catalog item in the ${p.cat} category.`,
        variants: p.variants ? { create: p.variants } : undefined,
      },
    });
    products.push({ id: created.id, sku: p.sku, name: p.name, cost: p.cost, price: p.price, reorder: p.reorder });
  }

  console.log("Suppliers & customers...");
  const supplierDefs = [
    { name: "Shenzhen Nova Electronics", email: "sales@novaelec.cn", phone: "+86 755 2399 1100" },
    { name: "Pacific Components Ltd.", email: "orders@pacificcomp.com", phone: "+1 415 555 0170" },
    { name: "BrightWave Distribution", email: "hello@brightwave.io", phone: "+1 212 555 0188" },
    { name: "Delta Peripherals Inc.", email: "supply@deltaperiph.com", phone: "+1 408 555 0144" },
  ];
  const suppliers = await Promise.all(supplierDefs.map((s) => db.supplier.create({ data: s })));

  const customerDefs = [
    { name: "Bolt Retail Group", email: "purchasing@boltretail.com", phone: "+1 310 555 0190" },
    { name: "Cedar & Pine Gifts", email: "owner@cedarpine.shop", phone: "+1 503 555 0155" },
    { name: "TechStop Franchise LLC", email: "supply@techstop.com", phone: "+1 702 555 0132" },
    { name: "Harbor City Schools", email: "procurement@harborcityk12.org", phone: "+1 510 555 0101" },
    { name: "Northside Office Supply", email: "orders@northsideoffice.com", phone: "+1 773 555 0177" },
    { name: "GreenLeaf Coworking", email: "ops@greenleaf.work", phone: "+1 206 555 0149" },
  ];
  const customers = await Promise.all(customerDefs.map((c) => db.customer.create({ data: c })));

  // ---- Replay 90 days of history so stock levels & movements are self-consistent ----
  console.log("Replaying 90 days of orders...");
  const stock = new Map<string, number>(); // `${productId}:${warehouseId}` -> qty
  const key = (p: string, w: string) => `${p}:${w}`;
  const movements: {
    type: MovementType; productId: string; warehouseId: string; quantity: number;
    reference: string; createdAt: Date; userId: string;
  }[] = [];

  let poSeq = 0, soSeq = 0, invSeq = 0;

  // Initial big stocking POs ~90 days ago
  for (const wh of [whMain, whEast]) {
    poSeq++;
    const number = `PO-${String(poSeq).padStart(4, "0")}`;
    const date = daysAgo(randInt(85, 90));
    const supplier = pick(suppliers);
    const lineDefs = products.map((p) => ({
      productId: p.id,
      quantity: wh.id === whMain.id ? randInt(60, 160) : randInt(30, 80),
      unitCost: p.cost,
    }));
    await db.purchaseOrder.create({
      data: {
        number, supplierId: supplier.id, warehouseId: wh.id, status: "RECEIVED",
        orderDate: date, createdAt: date,
        lines: { create: lineDefs.map((l) => ({ ...l, receivedQty: l.quantity })) },
      },
    });
    for (const l of lineDefs) {
      stock.set(key(l.productId, wh.id), (stock.get(key(l.productId, wh.id)) ?? 0) + l.quantity);
      movements.push({ type: "PURCHASE_RECEIPT", productId: l.productId, warehouseId: wh.id, quantity: l.quantity, reference: number, createdAt: date, userId: manager.id });
    }
  }

  // Transfer some stock to the retail backroom
  {
    const number = "TR-0001";
    const date = daysAgo(80);
    const lineDefs = products.slice(0, 12).map((p) => ({ productId: p.id, quantity: randInt(8, 20) }));
    await db.stockTransfer.create({
      data: {
        number, fromWarehouseId: whMain.id, toWarehouseId: whRetail.id,
        status: "COMPLETED", completedAt: date, createdAt: date,
        lines: { create: lineDefs },
      },
    });
    for (const l of lineDefs) {
      stock.set(key(l.productId, whMain.id), (stock.get(key(l.productId, whMain.id)) ?? 0) - l.quantity);
      stock.set(key(l.productId, whRetail.id), (stock.get(key(l.productId, whRetail.id)) ?? 0) + l.quantity);
      movements.push({ type: "TRANSFER_OUT", productId: l.productId, warehouseId: whMain.id, quantity: -l.quantity, reference: number, createdAt: date, userId: staff.id });
      movements.push({ type: "TRANSFER_IN", productId: l.productId, warehouseId: whRetail.id, quantity: l.quantity, reference: number, createdAt: date, userId: staff.id });
    }
  }

  // Weighted popularity so reports show fast/slow movers
  const weights = products.map((_, i) => (i % 5 === 0 ? 6 : i % 3 === 0 ? 3 : i % 7 === 0 ? 0.3 : 1));
  function pickWeighted() {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rand() * total;
    for (let i = 0; i < products.length; i++) {
      r -= weights[i];
      if (r <= 0) return products[i];
    }
    return products[products.length - 1];
  }

  // Sales orders across 88 days
  for (let day = 88; day >= 1; day--) {
    const orders = randInt(0, 3);
    for (let o = 0; o < orders; o++) {
      soSeq++;
      const number = `SO-${String(soSeq).padStart(4, "0")}`;
      const date = daysAgo(day);
      const customer = pick(customers);
      const wh = rand() < 0.75 ? whMain : whEast;
      const nLines = randInt(1, 4);
      const chosen = new Map<string, { productId: string; quantity: number; unitPrice: number }>();
      for (let i = 0; i < nLines; i++) {
        const p = pickWeighted();
        const have = stock.get(key(p.id, wh.id)) ?? 0;
        if (have < 2) continue;
        const qty = Math.min(randInt(1, 12), Math.max(1, Math.floor(have * 0.3)));
        if (!chosen.has(p.id)) chosen.set(p.id, { productId: p.id, quantity: qty, unitPrice: p.price });
      }
      if (!chosen.size) { soSeq--; continue; }
      const lines = [...chosen.values()];

      // recent orders stay open in various states
      const status = day <= 4 ? (rand() < 0.5 ? "CONFIRMED" : "PACKED") : day <= 8 && rand() < 0.3 ? "SHIPPED" : "DELIVERED";
      const shipped = status === "SHIPPED" || status === "DELIVERED";
      const so = await db.salesOrder.create({
        data: {
          number, customerId: customer.id, warehouseId: wh.id, status,
          orderDate: date, createdAt: date,
          lines: { create: lines.map((l) => ({ ...l, fulfilledQty: shipped ? l.quantity : 0 })) },
        },
      });
      if (shipped) {
        for (const l of lines) {
          stock.set(key(l.productId, wh.id), (stock.get(key(l.productId, wh.id)) ?? 0) - l.quantity);
          movements.push({ type: "SALE_SHIPMENT", productId: l.productId, warehouseId: wh.id, quantity: -l.quantity, reference: number, createdAt: date, userId: pick([staff, manager]).id });
        }
        // invoice most shipped orders
        if (rand() < 0.85) {
          invSeq++;
          const amount = lines.reduce((s, l) => s + l.quantity * l.unitPrice * 1.0875, 0);
          const due = new Date(date); due.setDate(due.getDate() + 30);
          const paid = rand() < 0.7;
          await db.invoice.create({
            data: {
              number: `INV-${String(invSeq).padStart(4, "0")}`, soId: so.id,
              status: paid ? "PAID" : due < new Date() ? "OVERDUE" : "SENT",
              amount: Math.round(amount * 100) / 100,
              issuedAt: date, dueAt: due, paidAt: paid ? new Date(due.getTime() - 86400000 * randInt(5, 25)) : null,
            },
          });
        }
      } else {
        await db.notification.create({
          data: { type: "ORDER_PENDING", title: "Order awaiting fulfilment", message: `${number} for ${lines.length} line(s) is ${status.toLowerCase()} and awaiting fulfilment.`, link: `/sales/${so.id}`, createdAt: date },
        });
      }
    }

    // occasional restock PO
    if (day % 18 === 3) {
      poSeq++;
      const number = `PO-${String(poSeq).padStart(4, "0")}`;
      const date = daysAgo(day);
      const supplier = pick(suppliers);
      const lineDefs = products.filter(() => rand() < 0.35).map((p) => ({ productId: p.id, quantity: randInt(20, 60), unitCost: p.cost }));
      if (!lineDefs.length) { poSeq--; continue; }
      const received = day > 6;
      await db.purchaseOrder.create({
        data: {
          number, supplierId: supplier.id, warehouseId: whMain.id,
          status: received ? "RECEIVED" : "ORDERED",
          orderDate: date, createdAt: date, expectedDate: received ? null : daysAgo(-randInt(2, 9), false),
          lines: { create: lineDefs.map((l) => ({ ...l, receivedQty: received ? l.quantity : 0 })) },
        },
      });
      if (received) {
        for (const l of lineDefs) {
          stock.set(key(l.productId, whMain.id), (stock.get(key(l.productId, whMain.id)) ?? 0) + l.quantity);
          movements.push({ type: "PURCHASE_RECEIPT", productId: l.productId, warehouseId: whMain.id, quantity: l.quantity, reference: number, createdAt: date, userId: manager.id });
        }
      }
    }
  }

  // A sales return and a supplier return for realism
  {
    soSeq++;
    const number = `SR-${String(soSeq).padStart(4, "0")}`;
    const date = daysAgo(5);
    const p = products[1];
    await db.salesOrder.create({
      data: {
        number, customerId: customers[0].id, warehouseId: whMain.id, status: "DELIVERED",
        isReturn: true, orderDate: date, createdAt: date,
        lines: { create: [{ productId: p.id, quantity: 3, unitPrice: p.price, fulfilledQty: 3 }] },
      },
    });
    stock.set(key(p.id, whMain.id), (stock.get(key(p.id, whMain.id)) ?? 0) + 3);
    movements.push({ type: "SALES_RETURN", productId: p.id, warehouseId: whMain.id, quantity: 3, reference: number, createdAt: date, userId: staff.id });
  }
  {
    poSeq++;
    const number = `PR-${String(poSeq).padStart(4, "0")}`;
    const date = daysAgo(12);
    const p = products[14];
    await db.purchaseOrder.create({
      data: {
        number, supplierId: suppliers[3].id, warehouseId: whMain.id, status: "RECEIVED",
        isReturn: true, orderDate: date, createdAt: date,
        lines: { create: [{ productId: p.id, quantity: 4, unitCost: p.cost, receivedQty: 4 }] },
      },
    });
    stock.set(key(p.id, whMain.id), (stock.get(key(p.id, whMain.id)) ?? 0) - 4);
    movements.push({ type: "SUPPLIER_RETURN", productId: p.id, warehouseId: whMain.id, quantity: -4, reference: number, createdAt: date, userId: manager.id });
  }

  // Force a couple of low/zero-stock situations for alert demos
  {
    const low = products[7]; // Aux cable
    const cur = stock.get(key(low.id, whMain.id)) ?? 0;
    if (cur > 5) {
      const delta = -(cur - 5);
      stock.set(key(low.id, whMain.id), 5);
      movements.push({ type: "ADJUSTMENT", productId: low.id, warehouseId: whMain.id, quantity: delta, reference: "ADJ-CYCLE-COUNT", createdAt: daysAgo(2), userId: manager.id });
    }
    const east = stock.get(key(low.id, whEast.id)) ?? 0;
    if (east > 0) {
      stock.set(key(low.id, whEast.id), 0);
      movements.push({ type: "ADJUSTMENT", productId: low.id, warehouseId: whEast.id, quantity: -east, reference: "ADJ-CYCLE-COUNT", createdAt: daysAgo(2), userId: manager.id });
    }
    const out = products[19]; // Portable SSD
    for (const wh of warehouses) {
      const q = stock.get(key(out.id, wh.id)) ?? 0;
      if (q > 0) {
        stock.set(key(out.id, wh.id), 0);
        movements.push({ type: "ADJUSTMENT", productId: out.id, warehouseId: wh.id, quantity: -q, reference: "ADJ-SHRINKAGE", createdAt: daysAgo(1), userId: manager.id });
      }
    }
  }

  console.log("Writing stock levels & movements...");
  const bins = ["A1-01", "A1-02", "A2-04", "B1-01", "B2-03", "C1-02", "C3-01", "D1-05"];
  const levelRows: { productId: string; warehouseId: string; quantity: number; binLocation: string }[] = [];
  for (const [k, qty] of stock) {
    const [productId, warehouseId] = k.split(":");
    levelRows.push({ productId, warehouseId, quantity: Math.max(0, qty), binLocation: pick(bins) });
  }
  await db.stockLevel.createMany({ data: levelRows });
  await db.stockMovement.createMany({ data: movements });

  console.log("Alerts & activity...");
  // notifications for current low/out of stock
  const all = await db.product.findMany({ include: { stockLevels: true } });
  for (const p of all) {
    const total = p.stockLevels.reduce((s, l) => s + l.quantity, 0);
    if (total === 0) {
      await db.notification.create({
        data: { type: "OUT_OF_STOCK", title: "Out of stock", message: `${p.name} [${p.sku}] is out of stock.`, link: `/products/${p.id}` },
      });
    } else if (total <= p.reorderPoint) {
      await db.notification.create({
        data: { type: "LOW_STOCK", title: "Low stock", message: `${p.name} [${p.sku}] is at ${total} ${p.unit} (reorder point ${p.reorderPoint}).`, link: `/products/${p.id}` },
      });
    }
  }

  const activitySamples: [string, string, string][] = [
    ["received goods", "PurchaseOrder", "PO-0007"],
    ["fulfilled sales order", "SalesOrder", "SO-0098"],
    ["created product", "Product", "NVMe Enclosure USB-C"],
    ["adjusted stock", "StockLevel", "-12 (cycle count)"],
    ["created invoice", "Invoice", "INV-0051"],
    ["created stock transfer", "StockTransfer", "TR-0001"],
    ["updated organization settings", "Organization", "Acme Supply Co."],
  ];
  for (let i = 0; i < activitySamples.length; i++) {
    const [action, entity, detail] = activitySamples[i];
    await db.activityLog.create({
      data: { userId: pick([admin, manager, staff]).id, action, entity, detail, createdAt: daysAgo(i === 0 ? 0 : randInt(0, 6)) },
    });
  }

  // fast-forward atomic document counters past seeded documents
  const counterPairs: [string, number][] = [
    ["SO", soSeq], ["SR", soSeq], ["PO", poSeq], ["PR", poSeq], ["INV", invSeq], ["TR", 1],
  ];
  for (const [id, value] of counterPairs) {
    await db.docCounter.upsert({ where: { id }, create: { id, value }, update: { value } });
  }

  const counts = {
    products: await db.product.count(),
    salesOrders: await db.salesOrder.count(),
    purchaseOrders: await db.purchaseOrder.count(),
    invoices: await db.invoice.count(),
    movements: await db.stockMovement.count(),
    notifications: await db.notification.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error(e);
    db.$disconnect();
    process.exit(1);
  });
