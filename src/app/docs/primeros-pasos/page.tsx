import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Primeros Pasos",
  description:
    "Configura tu cuenta REVIO, invita a tu equipo y deja listo el CRM automotriz para operar en el piso de ventas.",
};

export default function PrimerosPasosPage() {
  return (
    <article className="prose prose-slate dark:prose-invert max-w-none prose-headings:tracking-tight prose-a:text-primary prose-strong:text-foreground">
      <p className="not-prose mb-2 text-sm font-medium text-primary">
        <Link
          href="/docs"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          Documentación
        </Link>
        <span className="mx-2 text-border">/</span>
        Primeros Pasos
      </p>

      <h1>Primeros Pasos con REVIO</h1>

      <p className="lead">
        Esta guía te lleva desde la creación de la cuenta hasta la primera
        operación comercial en el CRM. El objetivo es dejar listo el entorno de
        tu concesionario con estructura clara, permisos correctos y un embudo
        alineado al flujo real del piso de ventas.
      </p>

      <h2>Qué vas a configurar</h2>
      <p>
        REVIO está pensado para equipos automotrices que necesitan velocidad y
        control: recepción de leads, seguimiento por WhatsApp, avance por etapas
        del embudo y una vista única del cliente. Antes de invitar a todo el
        equipo, conviene cerrar estos fundamentos.
      </p>

      <h2>Pasos recomendados</h2>
      <ol>
        <li>
          <strong>Crea la cuenta del concesionario.</strong> Regístrate con el
          correo corporativo del responsable comercial o del administrador del
          sistema. Este usuario será el propietario inicial de la organización.
        </li>
        <li>
          <strong>Define la identidad del negocio.</strong> Completa el nombre
          del concesionario, zona horaria y datos básicos. Así reportes,
          actividad del equipo y horarios de seguimiento quedan consistentes.
        </li>
        <li>
          <strong>Invita a asesores y gerencia.</strong> Agrega a los miembros
          del equipo con el rol adecuado. Limita permisos administrativos a
          quienes realmente gestionan la operación.
        </li>
        <li>
          <strong>Revisa el embudo de ventas.</strong> Ajusta las etapas a tu
          proceso real (por ejemplo: Lead → Cita → Prueba de manejo → Oferta →
          Cierre). Un embudo claro evita oportunidades estancadas.
        </li>
        <li>
          <strong>Importa o crea tus primeros contactos.</strong> Centraliza
          prospectos y clientes actuales para que el historial conversacional y
          comercial viva en un solo lugar desde el día uno.
        </li>
      </ol>

      <h2>Buenas prácticas operativas</h2>
      <ul>
        <li>
          Asigna un responsable por oportunidad; la visibilidad del embudo
          pierde valor si nadie es dueño del siguiente paso.
        </li>
        <li>
          Estandariza el nombrado de contactos y vehículos de interés para
          facilitar búsquedas y reportes.
        </li>
        <li>
          Capacita al equipo con un caso real (un lead de prueba) antes de
          operar con tráfico vivo.
        </li>
      </ul>

      <div className="not-prose my-8 rounded-xl border border-warning/30 bg-warning-soft/40 px-5 py-4">
        <p className="text-sm font-semibold text-warning">Nota importante</p>
        <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">
          No compartas credenciales de administrador entre asesores. Cada
          usuario debe tener su propio acceso para conservar trazabilidad de
          acciones, proteger datos de clientes y cumplir con una operación
          seria de software empresarial automotriz.
        </p>
      </div>

      <h2>Siguiente paso</h2>
      <p>
        Cuando la cuenta base esté lista, continúa con la configuración del{" "}
        <Link href="/docs/embudo-de-ventas">embudo de ventas</Link> y la{" "}
        <Link href="/docs/gestion-de-contactos">gestión de contactos</Link> para
        que el equipo trabaje con el mismo criterio comercial.
      </p>
    </article>
  );
}
