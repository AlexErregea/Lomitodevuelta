import { FlowShell } from '@/components/flow-shell';
import { FoundForm } from './found-form';

// Flujo B — "encontré un perro" (el flujo sagrado de fricción cero). Antes vivía
// en la home; con la landing como puerta, tiene su propia ruta (/encontre).
// El marco visual (fondo crema, marca, ancho de lectura) lo pone FlowShell.
export default function EncontrePage() {
  return (
    <FlowShell>
      <FoundForm />
    </FlowShell>
  );
}
