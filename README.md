# viuer

Aplicación Node.js con Express.

## 🚀 Instalación

1. Cloná este repositorio:

```bash
git clone https://github.com/GutiNicolas/viuer.git
cd viuer
```

2. Instalá las dependencias:

```bash
npm install
```

3. Configurá las variables de entorno:

Agregalas en el archivo `app.properties` en la raíz del proyecto. Ejemplo:

```
events.meta.url=localhost:9090
events.detail.url=localhost:9090
```

## ▶️ Ejecución

Para correr la app:

```bash
npm start
```

Por defecto corre en: `http://localhost:9090`

> Si preferís ejecutarla directamente:
> ```bash
> node app.js
> ```

## 🛠️ Scripts disponibles

- `npm start`: ejecuta `node app.js`

## 📦 Recomendaciones

- **No subas `node_modules/`**: ya está ignorado en `.gitignore`
- Asegurate de tener `Node.js` instalado (versión recomendada: 22+)

## 📁 Estructura típica

```
.
├── app.js
├── package.json
├── app.properties
├── .gitignore
└── README.md
```
