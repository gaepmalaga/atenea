-- =============================================================================
-- Documentos compartidos de los admin (regla 134)
-- =============================================================================
--
-- POR QUÉ
-- La documentación de la academia (logos, contratos, horarios, material de
-- clase, informes) vivía repartida entre correos, WhatsApp y Drive. Y el
-- repositorio de GitHub es público: ahí no puede ir nada privado. Esto es una
-- carpeta compartida DENTRO de la plataforma, solo para los admin de la
-- academia: carpetas con nombre, archivos con quién los subió y cuándo.
--
-- · `document_folders` — las carpetas, por academia.
-- · `admin_documents` — un archivo por fila; el fichero vive en el depósito
--   PRIVADO `documentos` de Supabase Storage (`storage_path`).
-- RLS activada y CERO políticas en las dos tablas: solo la clave de servicio
-- (regla 34), y cada acción acota por `organization_id`. El depósito es
-- privado y SIN políticas: nadie lo lee sin una URL firmada que emite la
-- acción de descarga, que antes exige ser admin de esa academia.
--
-- Seguro de repetir: no hace nada si ya existe.
-- =============================================================================

create table if not exists public.document_folders (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name            text not null check (char_length(name) between 1 and 60),
  created_by      uuid,
  created_at      timestamptz not null default now()
);
create unique index if not exists document_folders_nombre_unico
  on public.document_folders (organization_id, lower(name));

create table if not exists public.admin_documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  folder_id       uuid not null references public.document_folders(id) on delete restrict,
  name            text not null check (char_length(name) between 1 and 160),
  storage_path    text not null unique,
  mime_type       text not null,
  size_bytes      bigint not null check (size_bytes >= 0),
  uploaded_by     uuid,
  uploaded_email  text,
  created_at      timestamptz not null default now()
);
create index if not exists admin_documents_carpeta on public.admin_documents (organization_id, folder_id, created_at desc);

alter table public.document_folders enable row level security;
alter table public.admin_documents enable row level security;

-- El depósito privado (sin acceso público). 10 MB por fichero.
insert into storage.buckets (id, name, public, file_size_limit)
values ('documentos', 'documentos', false, 10485760)
on conflict (id) do nothing;

-- Las carpetas con las que arranca la academia de Alphapol.
insert into public.document_folders (organization_id, name)
select 'aeee26b3-b6a8-49da-a5c3-4d3c8cde6df2'::uuid, n
from (values ('Marca y logos'), ('Contratos y legal'), ('Horarios y cuadrantes'), ('Material de clase'), ('Informes')) v(n)
where not exists (
  select 1 from public.document_folders f
  where f.organization_id = 'aeee26b3-b6a8-49da-a5c3-4d3c8cde6df2'::uuid and lower(f.name) = lower(v.n)
);
