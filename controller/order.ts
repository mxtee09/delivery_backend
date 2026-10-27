import { Request, Response } from 'express';
import { conn } from '../dbconnect';

// Haversine formula calculation
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

export const createOrder = async (req: Request, res: Response) => {
    const { customer_id, quantity } = req.body;

    // เงื่อนไข 3: ตรวจสอบเงื่อนไขจำนวนกล่องฝั่ง Server-side 
    if (!quantity || quantity < 1 || quantity > 3) {
        return res.status(400).json({ error: "สั่งได้ 1-3 กล่องต่อออเดอร์เท่านั้น" });
    }

    try {
        // เงื่อนไข 4: ตรวจสอบลูกค้า/เบอร์โทรซ้ำภายใน "วันนี้"
        const [existingOrders]: any = await conn.execute(`
        SELECT id FROM orders 
        WHERE customer_id = ? AND DATE(order_date) = CURDATE()
    `, [customer_id]);

        if (existingOrders && existingOrders.length > 0) {
            return res.status(400).json({ error: "ลูกค้ารายนี้มีออเดอร์ของวันนี้ในระบบแล้ว ไม่สามารถสั่งซ้ำได้" });
        }

        const [result]: any = await conn.execute(
            `INSERT INTO orders (customer_id, quantity, order_date, status) VALUES (?, ?,NOW(), 'pending')`,
            [customer_id, quantity]
        );


        res.json({ id: result.insertId, customer_id, quantity, status: 'pending' });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
};

export const getOrders = async (req: Request, res: Response) => {
    try {
        const [rows] = await conn.execute(`
            SELECT orders.id, orders.quantity, orders.order_date,
                   customers.id as customer_id, customers.firstname, customers.lastname,
                   customers.lat, customers.lng
            FROM orders JOIN customers ON orders.customer_id = customers.id
        `);
        res.json(rows);
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
};

// ฟังก์ชันใหม่: จัดกลุ่มออเดอร์ให้มอเตอร์ไซค์แต่ละคัน (คันละไม่เกิน 10 กล่อง)
export const groupOrdersForRiders = async (req: Request, res: Response) => {
    try {
        // เงื่อนไข 2: เลือกลงกระเป๋าเฉพาะออเดอร์ที่สถานะเป็น 'pending' (ยังไม่ถูกจ่ายงาน)
        const [rows]: any = await conn.execute(`
            SELECT orders.id, orders.quantity, orders.order_date, orders.status,
                   customers.id as customer_id, customers.firstname, customers.lastname,
                   customers.lat, customers.lng
            FROM orders JOIN customers ON orders.customer_id = customers.id
            WHERE orders.status = 'pending'
            ORDER BY orders.order_date ASC
        `);

        if (rows.length === 0) {
            return res.json({ message: "ไม่มีออเดอร์ใหม่ที่รอจัดเส้นทาง" });
        }

        const riders: any[] = [];
        let currentRider = { rider_id: 1, total_quantity: 0, orders: [] as any[] };
        const assignedOrderIds: number[] = []; // เก็บ ID ออเดอร์ที่จัดลงกระเป๋าแล้ว

        for (const order of rows) {
            // เงื่อนไข 3: รถ 1 คันห้ามเกิน 10 กล่อง (ตรวจสอบซ้ำฝั่ง Backend)
            if (currentRider.total_quantity + order.quantity > 10) {
                if (currentRider.orders.length > 0) riders.push(currentRider);
                currentRider = { rider_id: riders.length + 1, total_quantity: 0, orders: [] };
            }
            currentRider.orders.push(order);
            currentRider.total_quantity += order.quantity;
            assignedOrderIds.push(order.id);
        }
        if (currentRider.orders.length > 0) riders.push(currentRider);

        // เงื่อนไข 2: Concurrency Lock อัปเดตสถานะเป็น 'assigned' ทันทีเพื่อล็อกใบงานไม่ให้ดึงซ้ำ
        if (assignedOrderIds.length > 0) {
            const placeholders = assignedOrderIds.map(() => '?').join(',');
            await conn.execute(
                `UPDATE orders SET status = 'assigned' WHERE id IN (${placeholders})`,
                assignedOrderIds
            );
        }

        res.json({ total_riders: riders.length, data: riders });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
};

export const completeDelivery = async (req: Request, res: Response) => {
    const orderId = req.params.id;
    try {
        const [check]: any = await conn.execute(`SELECT status FROM orders WHERE id = ?`, [orderId]);
        if (check.length === 0) return res.status(404).json({ error: "ไม่พบออเดอร์" });
        if (check[0].status === 'completed') return res.status(400).json({ error: "ออเดอร์นี้ถูกกดส่งสำเร็จไปแล้ว" });

        // เงื่อนไข 1: บันทึกเวลาด้วย datetime ของฝั่ง Server ทันทีเมื่อยิง API ป้องกันการแก้ไขเวลาจากมือถือ
        await conn.execute(`
            UPDATE orders 
            SET status = 'completed', delivered_at = datetime('now', 'localtime') 
            WHERE id = ?
        `, [orderId]);

        res.json({ message: "ยืนยันการส่งสำเร็จพร้อมบันทึกเวลาจริงเรียบร้อยแล้ว" });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
};

export const mockOrders = async (req: Request, res: Response) => {
    const mockCustomers = [
        ['John', 'Doe', '0801111111', 16.2445, 103.2501],
        ['Jane', 'Smith', '0802222222', 16.2468, 103.2520],
        ['Somchai', 'Jaidee', '0803333333', 16.2480, 103.2495],
        ['Suda', 'Rakngam', '0804444444', 16.2455, 103.2530],
        ['Piti', 'Maneerat', '0805555555', 16.2490, 103.2515]
    ];
    try {
        const insertedCustomerIds: number[] = [];

        // 1. สร้างลูกค้าและเก็บ ID จริงที่ได้จากฐานข้อมูลไว้
        for (const c of mockCustomers) {
            const [result]: any = await conn.execute(
                `INSERT INTO customers (firstname, lastname, phone, lat, lng) VALUES (?, ?, ?, ?, ?)`,
                c
            );
            insertedCustomerIds.push(result.insertId);
        }

        // 2. สุ่มสร้างออเดอร์โดยอ้างอิงจาก ID จริงที่มีอยู่ในระบบ
        for (let i = 0; i < 25; i++) {
            // สุ่มเลือก ID จากลูกค้า 5 คนที่เพิ่งสร้าง
            const randomIndex = Math.floor(Math.random() * insertedCustomerIds.length);
            const actualCustomerId = insertedCustomerIds[randomIndex];

            const randomQty = Math.floor(Math.random() * 5) + 1; // สุ่ม 1-5 กล่อง
            const randomMinutesAgo = Math.floor(Math.random() * 1440);
            const orderDate = new Date(Date.now() - randomMinutesAgo * 60 * 1000)
                .toISOString()
                .slice(0, 19)
                .replace('T', ' ');

            await conn.execute(`INSERT INTO orders (customer_id, quantity, order_date, status) VALUES (?, ?, ?, 'pending')`,
                [actualCustomerId, randomQty, orderDate]);
        }
        res.json({ message: "สร้างข้อมูลจำลองสำเร็จ โดยอ้างอิงจาก ID ลูกค้าจริง" });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
};

export const updateOrder = async (req: Request, res: Response) => {
    const { quantity } = req.body;
    if (quantity > 10) {
        return res.status(400).json({ error: "ไม่สามารถอัปเดตจำนวนเกิน 10 กล่องได้" });
    }
    try {
        await conn.execute(`UPDATE orders SET quantity = ? WHERE id = ?`, [quantity, req.params.id]);
        res.json({ message: "Order updated successfully" });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
};

export const deleteOrder = async (req: Request, res: Response) => {
    try {
        await conn.execute(`DELETE FROM orders WHERE id = ?`, [req.params.id]);
        res.json({ message: "Order deleted successfully" });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
};

export const clearAllOrders = async (req: Request, res: Response) => {
    try {
        await conn.execute(`DELETE FROM orders`);
        res.json({ message: "All orders cleared successfully" });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
};

export const getNearbyOrders = async (req: Request, res: Response) => {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: "Invalid lat/lng" });
    try {
        const [rows]: any = await conn.execute(`
            SELECT orders.id, orders.quantity, orders.order_date,
                   customers.id as customer_id, customers.firstname, customers.lat, customers.lng
            FROM orders JOIN customers ON orders.customer_id = customers.id
        `);
        const nearby = rows.filter((o: any) => calculateDistance(lat, lng, o.lat, o.lng) <= 2.0);
        res.json({ total: nearby.length, data: nearby });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
};