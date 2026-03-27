# 🚀 Getting started with Strapi

Strapi comes with a full featured [Command Line Interface](https://docs.strapi.io/dev-docs/cli) (CLI) which lets you scaffold and manage your project in seconds.

### `develop`

Start your Strapi application with autoReload enabled. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-develop)

```
npm run develop
# or
yarn develop
```

### `start`

Start your Strapi application with autoReload disabled. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-start)

```
npm run start
# or
yarn start
```

### `build`

Build your admin panel. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-build)

```
npm run build
# or
yarn build
```

### Import products from `products.json`

Air conditioner rows in the root file `products.json` can be pushed into the **Product** collection via the REST API.

1. Start Strapi: `npm run develop`
2. Create an **API Token**: Admin → **Settings** → **API Tokens** → Create (e.g. *Full access* or *Custom* with `create` on Product).
3. From this folder run:

```bash
STRAPI_API_TOKEN=your_token_here npm run import:products
```

Optional: `STRAPI_URL=https://your-server.com` if Strapi is not on `http://localhost:1337`.

Optional: `PRODUCTS_JSON=/absolute/path/to/products.json` if your file is not `tetclima-api/products.json`.

**Troubleshooting:** `Unexpected end of JSON input` means `products.json` was **empty** on disk — save the file in your editor, or fix the path. The API token must be the **long secret** from Strapi (copy when created), not the literal text `Full_Access`.

Images are not in the JSON file — add **image** media for each product in the Admin after import.

## ⚙️ Deployment

Strapi gives you many possible deployment options for your project including [Strapi Cloud](https://cloud.strapi.io). Browse the [deployment section of the documentation](https://docs.strapi.io/dev-docs/deployment) to find the best solution for your use case.

```
yarn strapi deploy
```

## 📚 Learn more

- [Resource center](https://strapi.io/resource-center) - Strapi resource center.
- [Strapi documentation](https://docs.strapi.io) - Official Strapi documentation.
- [Strapi tutorials](https://strapi.io/tutorials) - List of tutorials made by the core team and the community.
- [Strapi blog](https://strapi.io/blog) - Official Strapi blog containing articles made by the Strapi team and the community.
- [Changelog](https://strapi.io/changelog) - Find out about the Strapi product updates, new features and general improvements.

Feel free to check out the [Strapi GitHub repository](https://github.com/strapi/strapi). Your feedback and contributions are welcome!

## ✨ Community

- [Discord](https://discord.strapi.io) - Come chat with the Strapi community including the core team.
- [Forum](https://forum.strapi.io/) - Place to discuss, ask questions and find answers, show your Strapi project and get feedback or just talk with other Community members.
- [Awesome Strapi](https://github.com/strapi/awesome-strapi) - A curated list of awesome things related to Strapi.

---

<sub>🤫 Psst! [Strapi is hiring](https://strapi.io/careers).</sub>
