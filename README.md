# Plataforma de Análisis de Calidad de Energía (IE)

Aplicación web portátil (un solo HTML, sin backend) para visualizar y auditar
registros de calidad de energía del datalogger **Mi550**: tendencias, formas de
onda y fasores, eventos, espectros armónicos, análisis estadístico avanzado,
reporte experto con IA multi-proveedor y exportación de informes a PDF.

Desarrollada por **Inteligencia Energética (IE) — Ing. Mariano Almada**.

## Características principales

- **Multi-archivo**: carga varios CSV a la vez (registro periódico, armónicos,
  eventos y capturas de onda del Mi550).
- **Modo de medición**: Cargas (transformador/red), Grupo electrógeno o
  Renovable/inversor — el reporte, el marco teórico y las conclusiones se
  adaptan al punto medido.
  - Modo cargas: análisis del transformador (kVA nominal, curva de duración,
    rendimiento η(β) con típicos IEC para aceite y resina, placa editable).
  - Modo grupo: dispersión P–Q sobre curva de capacidad, ISO 8528-5, IEC 60034-1.
  - Modo inversor: IEEE 1547 / IEC 61727, ride-through, anti-islanding.
- **KPIs del período**: energía, demanda máxima, factor de carga, THD, desbalance,
  eventos y cobertura del registro.
- **IA multi-proveedor**: Xiaomi MiMo (directo), Google Gemini, OpenRouter y
  endpoint personalizado compatible OpenAI — con actualización de modelos en vivo.
- **PDF de auditoría** completo (portada, conclusiones, gráficos, ondas, THD,
  análisis avanzado, marco teórico y numeración).
- Filtro dinámico de valores espurios con alertas de instrumentación (CF = 0).

## Cómo usarla

1. Abrí `plataforma_analisis_calidad_energia.html` con doble clic en cualquier
   navegador moderno (requiere internet para las librerías CDN y la IA).
2. Seleccioná tus CSV del Mi550 y usá las pestañas: Gráficos, Contraste, Ondas,
   Eventos, Resumen, THD, Avanzado, Marco Teórico, Reporte IA, Conclusiones y
   Auditoría (exportación PDF).

## Configuración de API keys (Reporte IA)

La app no incluye ninguna clave. Para que la IA funcione sin escribirla en
pantalla:

1. Copiá `config.example.js` como `config.js` (mismo directorio).
2. Completá las claves que uses (`XIAOMI_API_KEY`, `GEMINI_API_KEY`,
   `OPENROUTER_API_KEY`).

`config.js` está ignorado por git y nunca se publica. Sin ese archivo, la app
pide la clave por pantalla y la guarda solo en el `localStorage` del navegador.

## Estructura del repositorio

```
├── plataforma_analisis_calidad_energia.html   # la app completa (archivo único)
├── config.example.js                          # plantilla de keys (sin credenciales)
├── config.js                                  # (ignorado) tus keys locales
├── .gitignore
└── README.md
```

## Notas técnicas

- Todo el procesamiento ocurre en el navegador: los datos de medición no salen
  de la máquina, salvo el contexto que se envía al proveedor de IA elegido
  cuando se genera el reporte experto.
- Compatible con los formatos de exportación del Mi550 (encabezado simple y de
  dos líneas, registros de eventos y de forma de onda).
