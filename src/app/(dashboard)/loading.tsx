export default function DashboardLoading() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm font-medium text-foreground">
          Cargando panel…
        </p>
        <p className="text-xs text-muted-foreground">
          La primera carga en desarrollo puede tardar uno o dos minutos.
        </p>
      </div>
    </div>
  );
}
