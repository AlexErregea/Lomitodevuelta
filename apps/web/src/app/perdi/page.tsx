import { FlowShell } from '@/components/flow-shell';
import { LostForm } from './lost-form';

// Flujo A — "perdí a mi perro" (Sprint 2): multi-foto, ficha autocompletada
// por la IA y corregible, búsqueda inmediata contra perros encontrados.
// El marco visual (fondo crema, marca, ancho de lectura) lo pone FlowShell.
export default function PerdiPage() {
  return (
    <FlowShell>
      <LostForm />
    </FlowShell>
  );
}
