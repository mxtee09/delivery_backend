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
    
    // ตรวจสอบเงื่อนไขกระเป๋าท้ายรถ: ห้ามสั่งเกิน 10 กล่องต่อออเดอร์
    if (quantity > 10) {
        return res.status(400).json({ error: "ไม่สามารถสั่งเกิน 10 กล่องได้ มอเตอร์ไซค์แบกหนักกว่านี้ไม่ได้ รถจะล้ม" });
    }

    try {
        const [result]: any = await conn.execute(
            `INSERT INTO orders (customer_id, quantity) VALUES (?, ?)`,
            [customer_id, quantity]
        );
        res.json({ id: result.insertId, customer_id, quantity });
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
        const [rows]: any = await conn.execute(`
            SELECT orders.id, orders.quantity, orders.order_date,
                   customers.id as customer_id, customers.firstname, customers.lastname,
                   customers.lat, customers.lng
            FROM orders JOIN customers ON orders.customer_id = customers.id
            ORDER BY orders.order_date ASC
        `);

        const riders: any[] = [];
        let currentRider = { rider_id: 1, total_quantity: 0, orders: [] as any[] };

        for (const order of rows) {
            // ถ้ายัดกล่องเพิ่มแล้วเกิน 10 ให้ปิดกระเป๋าคันปัจจุบัน แล้วเรียกมอเตอร์ไซค์คันใหม่
            if (currentRider.total_quantity + order.quantity > 10) {
                if (currentRider.orders.length > 0) {
                    riders.push(currentRider);
                }
                currentRider = { rider_id: riders.length + 1, total_quantity: 0, orders: [] };
            }
            
            currentRider.orders.push(order);
            currentRider.total_quantity += order.quantity;
        }
        
        // อย่าลืม push คันสุดท้ายเข้ากลุ่ม
        if (currentRider.orders.length > 0) {
            riders.push(currentRider);
        }

        res.json({ total_riders: riders.length, data: riders });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
};

export const mockOrders = async (req: Request, res: Response) => {
    // แก้ไขพิกัดสุ่มให้อยู่ในโซน มมส. (เขตขามเรียง: พิกัดประมาณ 16.24xx, 103.25xx)
    const mockCustomers = [
        ['John', 'Doe', '0801111111', 16.2445, 103.2501],
        ['Jane', 'Smith', '0802222222', 16.2468, 103.2520],
        ['Somchai', 'Jaidee', '0803333333', 16.2480, 103.2495],
        ['Suda', 'Rakngam', '0804444444', 16.2455, 103.2530],
        ['Piti', 'Maneerat', '0805555555', 16.2490, 103.2515]
    ];
    try {
        for (const c of mockCustomers) {
            await conn.execute(`INSERT INTO customers (firstname, lastname, phone, lat, lng) VALUES (?, ?, ?, ?, ?)`, c);
        }
        for (let i = 0; i < 25; i++) {
            const randomCustomerId = Math.floor(Math.random() * 5) + 1;
            // สุ่มสั่งแค่ 1-5 กล่องต่อครั้ง เพื่อให้จัดกลุ่มลงกระเป๋าได้ง่ายขึ้น
            const randomQty = Math.floor(Math.random() * 5) + 1;
            const randomMinutesAgo = Math.floor(Math.random() * 1440);
            const orderDate = new Date(Date.now() - randomMinutesAgo * 60 * 1000)
                .toISOString()
                .slice(0, 19)
                .replace('T', ' ');
            
            await conn.execute(`INSERT INTO orders (customer_id, quantity, order_date) VALUES (?, ?, ?)`,
                [randomCustomerId, randomQty, orderDate]);
        }
        res.json({ message: "สร้างข้อมูลจำลองในเขต มมส. สำเร็จ" });
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