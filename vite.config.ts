import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const generateVersionPlugin = () => {
  return {
    name: 'generate-version',
    buildStart() {
      const dir = path.resolve(__dirname, 'public')
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      const now = Date.now();
      const versionData = {
        version: String(now),
        buildId: now,
        commit: 'dev'
      };
      fs.writeFileSync(path.join(dir, 'version.json'), JSON.stringify(versionData))
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), generateVersionPlugin()],
})
