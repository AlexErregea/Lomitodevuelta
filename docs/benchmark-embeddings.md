# Benchmark del modelo de embeddings

> **Estado: PENDIENTE DE EJECUCIÓN.** Requiere dos insumos del fundador: la API key
> de Replicate y ~50-100 fotos reales de perros. Bloquea la calibración de las
> anclas `visual_floor`/`visual_ceil` (hoy son placeholders 0.70/0.92) — debe
> ejecutarse antes del lanzamiento (DoD del Sprint 0/1). Contexto: ADR-0003,
> matching-engine.md §4.2.

## Para qué sirve

Las anclas convierten la similitud coseno cruda en el componente S_visual. Cada
modelo distribuye sus similitudes distinto: sin medirlas con fotos reales de
perros, el score visual es una adivinanza. El benchmark también decide el modelo
definitivo (candidatos de la familia SigLIP en Replicate) comparando su capacidad
de separar "mismo perro" de "perros distintos".

## Insumos (tarea del fundador)

- **Fotos**: 15-25 perros distintos, 3-5 fotos de CADA uno (ángulos, luz y fondos
  variados — como serían las fotos reales de un reporte). Fuentes: perros propios,
  de conocidos, o datasets públicos (p. ej. Stanford Dogs) complementados con fotos
  caseras. Organizadas en carpetas: `benchmark-photos/perro-01/*.jpg`, etc.
- **Cuenta de Replicate** con API key y límite de gasto configurado (el benchmark
  completo cuesta < $1 USD).

## Método (lo ejecuta Claude Code en una sesión con los insumos listos)

1. Embeber todas las fotos con cada modelo candidato.
2. Calcular similitud coseno de todos los **pares mismo-perro** (positivos) y una
   muestra de **pares perros-distintos** (negativos), idealmente de raza/color
   parecidos (el caso difícil real).
3. Por modelo: distribución de ambos grupos, solape, y AUC aproximada. Elegir el
   modelo con mejor separación (y costo/latencia razonables).
4. Fijar anclas: `visual_floor` ≈ percentil 90 de los negativos;
   `visual_ceil` ≈ mediana de los positivos. Redondear conservador.
5. Registrar resultados aquí (tabla por modelo) + actualizar `matching_params`
   (fila nueva, no editar la activa) + fijar `embedding_model_version` definitivo.

## Resultados

| Modelo | Positivos (mediana) | Negativos (p90) | Solape | Decisión |
|---|---|---|---|---|
| _pendiente_ | | | | |

**Anclas elegidas**: _pendiente_ · **Modelo definitivo**: _pendiente_
