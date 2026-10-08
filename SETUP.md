# Putting the site and editor online

The site is generated from one file, `content/posts.json`. The editor at `yoursite.com/write/` changes that file for you, and Netlify rebuilds the site about a minute after every save. You never touch code.

## One-time setup (about 20 minutes)

**1. GitHub (where the files live).** Make a free account, then create a new repository called `wss-site`. Choose **Private**. Unzip this project, open the repository page, choose "uploading an existing file", and drag in everything from inside the unzipped folder.

**2. Netlify (what publishes it).** Sign up with your GitHub login, choose "Add new site", then "Import an existing project", and pick `wss-site`. Every build setting is already in `netlify.toml`, so just deploy.

**3. A key so the editor can save.** In GitHub go to Settings, Developer settings, Personal access tokens, Fine-grained tokens, and generate a new one. Give it access to only the `wss-site` repository, with the permission **Contents: Read and write**. Copy the token somewhere safe, because GitHub only shows it once.

**4. Tell Netlify about it.** In Netlify open Site configuration, then Environment variables, and add:

| Name | Value |
|---|---|
| `ADMIN_PASSWORD` | A long password only you know. This is what you type at the editor's login. |
| `GITHUB_TOKEN` | The token from step 3. |
| `GITHUB_REPO` | `yourgithubusername/wss-site` |
| `GITHUB_BRANCH` | `main` |

Then go to Deploys and trigger a fresh deploy so the settings take effect.

**5. Open `/write/`** on your site and log in.

## Everyday use

Click any post to fix a typo and hit Save. Use "+ New episode" or "+ New poem" to publish something new. Photos you upload are resized automatically. Set a post to Draft to hide it without deleting anything.

## Good to know

- Every save is a saved version in GitHub, so any edit can be undone from the repository's History.
- Your site address for `/write/` is not linked anywhere and is hidden from search engines, but the password is what actually protects it. Make it long.
- To connect whatsheridansaid.com later, use Netlify's Domain management.
