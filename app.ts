import express from 'express';
import cors from 'cors';
import { 
    createCustomer, getCustomers, updateCustomer, deleteCustomer, searchCustomers, getNearbyCustomers, 
    clearAllCustomers
} from './controller/customer';
import { 
    createOrder, getOrders, updateOrder, deleteOrder, mockOrders, clearAllOrders, getNearbyOrders, completeDelivery, groupOrdersForRiders 
} from './controller/order'; // <--- 1. เพิ่ม groupOrdersForRiders กลับมาที่นี่

const app = express();

app.use(cors());
app.use(express.json());

// Customer Routes
app.post('/api/customers', createCustomer);
app.get('/api/customers', getCustomers);
app.get('/api/customers/search', searchCustomers);     // ย้ายเส้นทางเฉพาะเจาะจงมาไว้ด้านบน
app.get('/api/customers/nearby', getNearbyCustomers);  // ย้ายเส้นทางเฉพาะเจาะจงมาไว้ด้านบน
app.delete('/api/customers/clear-all', clearAllCustomers);

// เอาเส้นทางที่มีตัวแปร :id ไว้ล่างสุด
app.put('/api/customers/:id', updateCustomer);
app.delete('/api/customers/:id', deleteCustomer);

// Order Routes
app.post('/api/orders', createOrder);
app.get('/api/orders', getOrders);
app.post('/api/orders/mock', mockOrders);
app.get('/api/orders/grouped', groupOrdersForRiders); // <--- 2. เพิ่มเส้นทางจัดเส้นทางไรเดอร์กลับมาที่นี่
app.delete('/api/orders/clear-all', clearAllOrders);
app.get('/api/orders/nearby', getNearbyOrders);

app.put('/api/orders/:id/complete', completeDelivery);
// เอาเส้นทางที่มีตัวแปร :id ไว้ล่างสุด
app.put('/api/orders/:id', updateOrder);
app.delete('/api/orders/:id', deleteOrder);

export default app;