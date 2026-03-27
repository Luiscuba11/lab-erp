# BIO PAP LabERP — Fix & Harden Result Type System

Fix and harden the entire result type system in BIO PAP LabERP.
The core problem: qualitative/semi-quantitative/titer results 
are saving and displaying as "0" instead of their actual values.

## BUG FIXES REQUIRED

### 1. Result Storage Bug
The results table is storing numeric 0 for all result types.
Fix the schema and API:

- results table must store: result_value TEXT (not numeric)
  This allows storing "Positivo", "++", "1/160", "Reactivo", etc.
- Fix the POST /api/results endpoint to accept text values
- Fix validation logic — do NOT compare text values numerically
- Fix flag calculation per result type:
  * NUMERIC: compare number vs min/max → NORMAL/LOW/HIGH/CRITICAL
  * QUALITATIVE: check if value is in abnormal_values list → ABNORMAL/NORMAL
  * SEMI_QUANTITATIVE: check index >= abnormal_threshold → ABNORMAL/NORMAL  
  * TITER: check if titer index >= significant_threshold → SIGNIFICANT/NOT_SIGNIFICANT
  * TEXT: always INFORMATIVO (no flag)
  * MULTI_PARAMETER: flag each sub-parameter individually

### 2. Results Entry UI Bug
When entering results, inputs must match the result type:
- NUMERIC → input type number with live flag preview
- QUALITATIVE → select or radio buttons with the configured options
- SEMI_QUANTITATIVE → styled button group: [Negativo] [+] [++] [+++] [++++] selected button highlights in color
- TITER → select with titer values
- TEXT → textarea
- MULTI_PARAMETER → render each sub-parameter with its own correct input type (recursive)

### 3. Report Display Bug  
In the printed report and results view:
- Show the actual text value, never "0" or numeric cast
- Flag display per type:
  * NORMAL / BAJO / ALTO / CRÍTICO (for numeric)
  * ANORMAL (for qualitative abnormal)
  * SIGNIFICATIVO (for significant titers)
  * INFORMATIVO (for text)
- For MULTI_PARAMETER: show a grouped table with sections

---

## REDESIGN: NEW TEST CREATOR (Ultra-flexible)

Completely rebuild the "Nueva Prueba" modal to be the most
flexible and user-friendly test configurator possible.

### Step 1 — Basic Info
- Código (required)
- Nombre de la prueba (required)
- Categoría (dropdown)
- Tiempo estimado (minutes)
- Precio en S/. (decimal)
- Tipo de muestra principal (dropdown: Suero, Sangre Total, Orina, LCR, Heces, Secreción, Aliento, Otro)

### Step 2 — Result Structure
Radio selector with visual icons and descriptions:

🔢 NUMÉRICO — Single number with min/max reference ranges
📋 CUALITATIVO — Select from custom options (Positivo/Negativo, Reactivo/No Reactivo, etc.)
📊 SEMI-CUANTITATIVO — Plus system (Negativo / + / ++ / +++ / ++++)
🧪 TÍTULO/DILUCIÓN — Titer dilutions (No reactivo / 1/20 / 1/40 / 1/80...)
📝 TEXTO LIBRE — Free text findings
🔬 MULTI-PARÁMETRO — Multiple sub-parameters (Hemograma, Orina, Perfil lipídico)

### Step 3a — If NUMÉRICO selected:
Reference range table by age group and sex:
- Child M / Child F (min - max)
- Adult M / Adult F (min - max)
- Elder M / Elder F (min - max)
With +/- buttons for quick adjustment of each value.

### Step 3b — If CUALITATIVO selected:
"Opciones de resultado:" with [+ Agregar opción] button
Each option row: [text input] [checkbox: Es anormal] [delete button]
Examples:
- Reactivo → anormal
- No Reactivo → normal
- Indeterminado → anormal

### Step 3c — If SEMI-CUANTITATIVO selected:
"Valores en orden (de menor a mayor):" with [+ Agregar valor]
Each row: [text input] [reorder arrows] [delete]
Default values: Negativo / + / ++ / +++ / ++++
"Considerar anormal desde:" dropdown of the values list

### Step 3d — If TÍTULO/DILUCIÓN selected:
Preset buttons: [VDRL estándar] [Widal] [ASO] [Brucella] [Personalizado]

VDRL estándar auto-fills: No reactivo / 1/2 / 1/4 / 1/8 / 1/16 / 1/32 / 1/64 / 1/128
Widal auto-fills: No reactivo / 1/20 / 1/40 / 1/80 / 1/160 / 1/320

"Título significativo desde:" dropdown
Allow adding/removing titer values

### Step 3e — If TEXTO LIBRE selected:
- "Instrucciones para el técnico:" textarea
- "Plantilla de informe:" textarea with placeholder text
- Option to add structured fields within the text

### Step 3f — If MULTI-PARÁMETRO selected:
Parameter builder with:
- [+ Agregar Sección] button — creates named section (FÍSICO, QUÍMICO, etc.)
- [+ Agregar Parámetro] button inside each section
- Each parameter: Name | Unit | Type (same 6 types) | Reference/Options
- Support up to 40 parameters total across all sections
- Reorder with up/down arrows
- Delete individual parameters

### Step 4 — Preview
Show a preview of how the results entry form will look for this test before saving.

---

## RESULT ENTRY — ENHANCED UI

For MULTI_PARAMETER tests show a professional structured form grouped by sections.
For each sub-parameter show: name, appropriate input, live flag badge, reference range.

For QUALITATIVE in entry form: show radio buttons or styled dropdown, not a number input.
For SEMI_QUANTITATIVE: show styled button group where clicking highlights the selection.
For TITER: show dropdown with all configured titer options.

---

## PRINTED REPORT — CORRECT DISPLAY

### For NUMERIC results:
Show value + unit + flag (NORMAL/BAJO/ALTO/CRÍTICO) + reference range

### For QUALITATIVE results:
Show selected option text (e.g., "No Reactivo") + NORMAL or ANORMAL badge
Reference column: show which values are normal

### For SEMI_QUANTITATIVE results:
Show value (e.g., "++") + flag badge
Reference: "Negativo / +"= normal, "++" o más = anormal

### For TITER results:
Show titer value (e.g., "1/16") + SIGNIFICATIVO or NO SIGNIFICATIVO
Reference: "Significativo a partir de 1/8"

### For MULTI_PARAMETER results:
Show grouped table with section headers in bold.
Each sub-parameter on its own row with its own flag.

---

## FINAL VALIDATION CHECKLIST

After all changes, verify these 7 scenarios work end-to-end:

1. NUMERIC: Create glucosa test → enter 250 → shows ALTO → saves → prints "250 mg/dL ALTO"
2. QUALITATIVE: Create HIV test → select "Reactivo" → shows ANORMAL → prints "Reactivo ANORMAL"
3. SEMI_QUANTITATIVE: Create proteínas orina → click "++" → shows ANORMAL → prints "++"
4. TITER: Create VDRL → select "1/16" → shows SIGNIFICATIVO → prints "1/16 SIGNIFICATIVO"
5. TEXT: Create morfología → enter free text → prints full text with INFORMATIVO
6. MULTI_PARAMETER Hemograma: Enter 20+ numeric sub-params → each flags independently → prints grouped table
7. MULTI_PARAMETER Orina: Mixed types (pH numeric + proteínas semi-quant + nitritos qualitative) → all save and print correctly

Confirm all modified files after completion.
