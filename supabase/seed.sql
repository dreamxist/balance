-- Default categories (parent categories + common subcategories)
INSERT INTO categories (id, name, parent_id, entity, sort_order) VALUES
  -- Parents
  ('necesidad', 'Necesidad', null, 'personal', 1),
  ('consumo', 'Consumo', null, 'personal', 2),
  ('ingreso', 'Ingreso', null, 'personal', 3),
  ('ahorro', 'Ahorro', null, 'personal', 4),
  ('deuda', 'Deuda', null, 'personal', 5),
  ('transfer', 'Transfer', null, 'personal', 6),
  -- Necesidad subcategories
  ('necesidad.arriendo', 'Arriendo', 'necesidad', 'personal', 1),
  ('necesidad.servicios', 'Servicios Basicos', 'necesidad', 'personal', 2),
  ('necesidad.super', 'Supermercado', 'necesidad', 'personal', 3),
  ('necesidad.bencina', 'Bencina y TAG', 'necesidad', 'personal', 4),
  ('necesidad.salud', 'Salud', 'necesidad', 'personal', 5),
  ('necesidad.transporte', 'Transporte', 'necesidad', 'personal', 6),
  -- Consumo subcategories
  ('consumo.comida', 'Comida afuera', 'consumo', 'personal', 1),
  ('consumo.ropa', 'Ropa', 'consumo', 'personal', 2),
  ('consumo.entretencion', 'Entretencion', 'consumo', 'personal', 3),
  ('consumo.tech', 'Tecnologia', 'consumo', 'personal', 4),
  ('consumo.hogar', 'Hogar', 'consumo', 'personal', 5),
  -- Ingreso subcategories
  ('ingreso.sueldo', 'Sueldo', 'ingreso', 'personal', 1),
  ('ingreso.freelance', 'Freelance', 'ingreso', 'personal', 2),
  ('ingreso.otro', 'Otro ingreso', 'ingreso', 'personal', 3),
  -- Ahorro subcategories
  ('ahorro.inversion', 'Inversion', 'ahorro', 'personal', 1),
  ('ahorro.fondo', 'Fondo de emergencia', 'ahorro', 'personal', 2),
  -- SpA categories
  ('spa.ingreso', 'Ingreso SpA', null, 'spa', 1),
  ('spa.gasto', 'Gasto SpA', null, 'spa', 2),
  ('spa.ingreso.factura', 'Factura', 'spa.ingreso', 'spa', 1),
  ('spa.gasto.operacional', 'Operacional', 'spa.gasto', 'spa', 1),
  ('spa.gasto.impuesto', 'Impuestos', 'spa.gasto', 'spa', 2)
ON CONFLICT (id) DO NOTHING;
