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
}

export const createCustomer = async (req: Request, res: Response) => {
    const { firstname, lastname, phone, lat, lng } = req.body;
    try {
        const [result]: any = await conn.execute(
            `INSERT INTO customers (firstname, lastname, phone, lat, lng) VALUES (?, ?, ?, ?, ?)`,
            [firstname, lastname, phone, lat, lng]
        );
        res.json({ id: result.insertId, firstname, lastname, phone, lat, lng });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
};

export const getCustomers = async (req: Request, res: Response) => {
    try {
        const [rows] = await conn.execute(`SELECT * FROM customers`);
        res.json(rows);
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
};

export const updateCustomer = async (req: Request, res: Response) => {
    const { firstname, lastname, phone, lat, lng } = req.body;
    try {
        await conn.execute(
            `UPDATE customers SET firstname = ?, lastname = ?, phone = ?, lat = ?, lng = ? WHERE id = ?`,
            [firstname, lastname, phone, lat, lng, req.params.id]
        );
        res.json({ message: "Customer updated successfully" });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
};

export const deleteCustomer = async (req: Request, res: Response) => {
    try {
        await conn.execute(`DELETE FROM customers WHERE id = ?`, [req.params.id]);
        res.json({ message: "Customer deleted successfully" });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
};

export const searchCustomers = async (req: Request, res: Response) => {
    const { keyword } = req.query;
    const searchPattern = `%${keyword}%`;
    try {
        const [rows] = await conn.execute(
            `SELECT * FROM customers WHERE firstname LIKE ? OR lastname LIKE ?`,
            [searchPattern, searchPattern]
        );
        res.json(rows);
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
};

export const getNearbyCustomers = async (req: Request, res: Response) => {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: "Invalid lat/lng" });
    
    try {
        const [rows]: any = await conn.execute(`SELECT * FROM customers`);
        const nearby = rows.filter((c: any) => calculateDistance(lat, lng, c.lat, c.lng) <= 1.0);
        res.json({ total: nearby.length, data: nearby });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
};

export const clearAllCustomers = async (req: Request, res: Response) => {
    try {
        await conn.execute(`DELETE FROM customers`);
        res.json({ message: "ลบข้อมูลลูกค้าทั้งหมดเรียบร้อยแล้ว" });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
};