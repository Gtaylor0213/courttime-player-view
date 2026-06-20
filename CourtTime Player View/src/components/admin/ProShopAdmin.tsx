import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { ShoppingBag, Plus, Pencil, Trash2 } from 'lucide-react';
import { proShopApi } from '../../api/client';
import { useAppContext } from '../../contexts/AppContext';
import { toast } from 'sonner';

const CATEGORIES = [
  { value: 'clothing', label: 'Clothing' },
  { value: 'rackets', label: 'Rackets' },
  { value: 'balls', label: 'Balls' },
  { value: 'bags', label: 'Bags' },
  { value: 'footwear', label: 'Footwear' },
  { value: 'accessories', label: 'Accessories' },
  { value: 'other', label: 'Other' },
];

const CATEGORY_COLORS: Record<string, string> = {
  clothing: 'bg-blue-100 text-blue-700',
  rackets: 'bg-purple-100 text-purple-700',
  balls: 'bg-yellow-100 text-yellow-700',
  bags: 'bg-orange-100 text-orange-700',
  footwear: 'bg-green-100 text-green-700',
  accessories: 'bg-pink-100 text-pink-700',
  other: 'bg-gray-100 text-gray-600',
};

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

const emptyForm = {
  name: '',
  description: '',
  category: 'accessories',
  price: '',
  stock: '',
  is_active: true,
  image_data: null as string | null,
};

export default function ProShopAdmin() {
  const { selectedFacilityId: currentFacilityId } = useAppContext();
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentFacilityId) return;
    loadProducts();
  }, [currentFacilityId]);

  const loadProducts = async () => {
    setLoading(true);
    const res = await proShopApi.adminGetProducts(currentFacilityId!);
    if (res.success) setProducts(res.data as any[]);
    else toast.error((res.error as string) || 'Failed to load products');
    setLoading(false);
  };

  const loadOrders = async () => {
    setOrdersLoading(true);
    const res = await proShopApi.adminGetOrders(currentFacilityId!);
    if (res.success) setOrders(res.data as any[]);
    else toast.error((res.error as string) || 'Failed to load orders');
    setOrdersLoading(false);
  };

  const openAdd = () => {
    setEditingProduct(null);
    setForm({ ...emptyForm });
    setModalOpen(true);
  };

  const openEdit = (product: any) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      description: product.description || '',
      category: product.category,
      price: (product.price_cents / 100).toFixed(2),
      stock: product.stock_quantity != null ? String(product.stock_quantity) : '',
      is_active: product.is_active,
      image_data: product.image_data ?? null,
    });
    setModalOpen(true);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return; }
    const reader = new FileReader();
    reader.onload = () => setForm(prev => ({ ...prev, image_data: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.category || !form.price) {
      toast.error('Name, category, and price are required');
      return;
    }
    const price_cents = Math.round(parseFloat(form.price) * 100);
    if (isNaN(price_cents) || price_cents < 0) { toast.error('Invalid price'); return; }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      category: form.category,
      price_cents,
      stock_quantity: form.stock !== '' ? parseInt(form.stock) : null,
      image_data: form.image_data,
      is_active: form.is_active,
    };

    setSaving(true);
    let res: any;
    if (editingProduct) {
      res = await proShopApi.adminUpdateProduct(editingProduct.id, payload);
    } else {
      res = await proShopApi.adminCreateProduct(currentFacilityId!, payload);
    }

    if (res.success) {
      toast.success(editingProduct ? 'Product updated' : 'Product added');
      setModalOpen(false);
      await loadProducts();
    } else {
      toast.error((res.error as string) || 'Failed to save product');
    }
    setSaving(false);
  };

  const handleDelete = async (product: any) => {
    if (!confirm(`Remove "${product.name}" from the pro shop?`)) return;
    setDeletingId(product.id);
    const res = await proShopApi.adminDeleteProduct(product.id);
    if (res.success) {
      const msg = (res.data as any)?.reason === 'deactivated'
        ? `"${product.name}" deactivated (has order history)`
        : `"${product.name}" deleted`;
      toast.success(msg);
      await loadProducts();
    } else {
      toast.error(res.error || 'Failed to delete');
    }
    setDeletingId(null);
  };

  const handleToggleActive = async (product: any) => {
    const res = await proShopApi.adminUpdateProduct(product.id, { is_active: !product.is_active });
    if (res.success) {
      toast.success(product.is_active ? 'Product hidden from shop' : 'Product visible in shop');
      await loadProducts();
    } else {
      toast.error(res.error || 'Failed to update');
    }
  };

  if (!currentFacilityId) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-gray-400">
          Select a facility to manage the pro shop.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShoppingBag className="h-6 w-6 text-indigo-600" />
        <h1 className="text-2xl font-semibold text-gray-900">Pro Shop</h1>
      </div>

      <Tabs defaultValue="products" className="space-y-4">
        <TabsList>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="orders" onClick={() => { if (orders.length === 0) loadOrders(); }}>Orders</TabsTrigger>
        </TabsList>

        {/* ── Products tab ── */}
        <TabsContent value="products">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Inventory</CardTitle>
              <Button size="sm" onClick={openAdd}>
                <Plus className="h-4 w-4 mr-1" /> Add Product
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-10">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
                </div>
              ) : products.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No products yet. Add your first item.</p>
              ) : (
                <div className="space-y-2">
                  {products.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 p-3 border rounded-lg">
                      {p.image_data ? (
                        <img src={p.image_data} alt={p.name} className="h-12 w-12 rounded object-cover flex-shrink-0" />
                      ) : (
                        <div className="h-12 w-12 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <ShoppingBag className="h-5 w-5 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{p.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[p.category] || CATEGORY_COLORS.other}`}>
                            {p.category}
                          </span>
                          {!p.is_active && <Badge variant="secondary" className="text-xs">Hidden</Badge>}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-sm font-semibold text-gray-700">{formatPrice(p.price_cents)}</span>
                          <span className="text-xs text-gray-400">
                            {p.stock_quantity != null ? `${p.stock_quantity} in stock` : 'Unlimited'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Switch
                          checked={p.is_active}
                          onCheckedChange={() => handleToggleActive(p)}
                          title={p.is_active ? 'Hide from shop' : 'Show in shop'}
                        />
                        <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(p)}
                          disabled={deletingId === p.id}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Orders tab ── */}
        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Orders</CardTitle>
            </CardHeader>
            <CardContent>
              {ordersLoading ? (
                <div className="flex justify-center py-10">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
                </div>
              ) : orders.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No orders yet.</p>
              ) : (
                <div className="space-y-2">
                  {orders.map((o) => (
                    <div key={o.id} className="p-3 border rounded-lg space-y-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium">{o.member_name}</span>
                          <span className="text-xs text-gray-400 ml-2">{o.member_email}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{formatPrice(o.total_cents)}</span>
                          <Badge variant={o.status === 'paid' ? 'default' : o.status === 'cancelled' ? 'destructive' : 'secondary'} className="text-xs capitalize">
                            {o.status}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">
                        {o.items?.map((i: any) => `${i.name} ×${i.quantity}`).join(', ')}
                      </p>
                      <p className="text-xs text-gray-400">{new Date(o.created_at).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Add / Edit modal ── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Edit Product' : 'Add Product'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Wilson Pro Staff 97" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category *</Label>
                <Select value={form.category} onValueChange={(v: string) => setForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Price *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-sm text-gray-500">$</span>
                  <Input className="pl-6" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} placeholder="0.00" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <textarea
                className="w-full min-h-[70px] rounded-md border border-input bg-input-background px-3 py-2 text-sm"
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Optional description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Stock Quantity</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.stock}
                  onChange={e => setForm(p => ({ ...p, stock: e.target.value }))}
                  placeholder="Leave blank for unlimited"
                />
              </div>
              <div className="space-y-2">
                <Label>Visible in Shop</Label>
                <div className="flex items-center h-10">
                  <Switch checked={form.is_active} onCheckedChange={(v: boolean) => setForm(p => ({ ...p, is_active: v }))} />
                  <span className="ml-2 text-sm text-gray-500">{form.is_active ? 'Visible' : 'Hidden'}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Product Image</Label>
              {form.image_data && (
                <div className="relative w-24 h-24 mb-2">
                  <img src={form.image_data} alt="preview" className="w-24 h-24 object-cover rounded border" />
                  <button
                    onClick={() => setForm(p => ({ ...p, image_data: null }))}
                    className="absolute -top-1 -right-1 bg-white border rounded-full w-5 h-5 flex items-center justify-center text-gray-500 hover:text-red-500 text-xs"
                  >×</button>
                </div>
              )}
              <Input type="file" accept="image/*" onChange={handleImageChange} className="cursor-pointer" />
              <p className="text-xs text-gray-400">Max 5MB</p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editingProduct ? 'Save Changes' : 'Add Product'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
