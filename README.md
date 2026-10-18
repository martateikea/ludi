# Ludi

Nuestros juegos de mesa, las partidas que echamos y quién va ganando.

- **App:** `index.html` + `app.js`, publicada con GitHub Pages.
- **Datos:** un Google Sheet con tres pestañas (`Juegos`, `Partidas`, `Jugadores`).
- **Puente:** `apps-script/Code.gs`, una aplicación web de Apps Script que lee y escribe en el Sheet.

## Puesta en marcha

### 1. Apps Script
1. Abre el Google Sheet → **Extensiones → Apps Script**.
2. Borra lo que haya en `Code.gs` y pega el contenido de [`apps-script/Code.gs`](apps-script/Code.gs). Guarda.
3. **Configuración del proyecto** (rueda dentada) → **Propiedades del script** → añade `PIN` con el código de casa.
   Si el script no se creó desde el propio Sheet, añade también `SHEET_ID` (el trozo de la URL del Sheet entre `/d/` y `/edit`).
4. **Implementar → Gestionar implementaciones** → lápiz → *Versión: nueva versión* → **Implementar**.
   Tipo *Aplicación web*, ejecutar como *Yo*, acceso *Cualquier usuario*.
   La primera vez Google pedirá permisos: acepta con tu cuenta.

Las pestañas y los juegos iniciales se crean solos la primera vez que alguien entra en la app.

### 2. GitHub Pages
Repositorio → **Settings → Pages** → *Deploy from a branch* → `main` / `/ (root)` → Save.
La app queda en `https://martateikea.github.io/ludi/`.

### 3. En el móvil
Abre la dirección, escribe el PIN y elige quién eres.
Para tenerla como app: **Compartir → Añadir a pantalla de inicio** (iPhone) o **⋮ → Añadir a pantalla de inicio** (Android).

## Cambios en el puente
Cada vez que cambie `Code.gs` hay que pegarlo de nuevo y hacer **Gestionar implementaciones → nueva versión**.
Así la URL no cambia y la app sigue funcionando.
