#!/usr/bin/env tsx
/**
 * 未使用代码分析脚本
 * 分析项目中未使用的页面、API路由、组件和库函数
 */

import * as fs from 'fs'
import * as path from 'path'

interface AnalysisResult {
  pages: {
    used: string[]
    unused: string[]
  }
  apiRoutes: {
    used: string[]
    unused: string[]
  }
  components: {
    used: string[]
    unused: string[]
  }
  libFiles: {
    used: string[]
    unused: string[]
  }
}

// 获取所有文件
function getAllFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir)
  
  files.forEach(file => {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)
    
    if (stat.isDirectory()) {
      // 跳过 node_modules, .next, .git 等目录
      if (!['node_modules', '.next', '.git', 'dist', 'build'].includes(file)) {
        getAllFiles(filePath, fileList)
      }
    } else if (stat.isFile()) {
      // 只处理 TypeScript/JavaScript 文件
      if (/\.(ts|tsx|js|jsx)$/.test(file)) {
        fileList.push(filePath)
      }
    }
  })
  
  return fileList
}

// 从文件内容中提取导入语句
function extractImports(content: string): string[] {
  const imports: string[] = []
  
  // 匹配各种导入模式
  const patterns = [
    /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
    /import\s+['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /from\s+['"]([^'"]+)['"]/g,
  ]
  
  patterns.forEach(pattern => {
    let match
    while ((match = pattern.exec(content)) !== null) {
      imports.push(match[1])
    }
  })
  
  return imports
}

// 检查文件是否被引用
function isFileReferenced(
  filePath: string,
  allFiles: string[],
  projectRoot: string
): boolean {
  // 排除自身
  const otherFiles = allFiles.filter(f => f !== filePath)
  
  // 将文件路径转换为可能的导入路径
  const relativePath = path.relative(projectRoot, filePath)
  const possibleImports = generatePossibleImports(relativePath)
  
  // 检查所有其他文件是否引用了这个文件
  for (const otherFile of otherFiles) {
    try {
      const content = fs.readFileSync(otherFile, 'utf-8')
      const imports = extractImports(content)
      
      for (const importPath of imports) {
        for (const possibleImport of possibleImports) {
          if (importPath.includes(possibleImport) || possibleImport.includes(importPath)) {
            return true
          }
        }
      }
    } catch (error) {
      // 忽略读取错误
    }
  }
  
  return false
}

// 生成可能的导入路径
function generatePossibleImports(relativePath: string): string[] {
  const imports: string[] = []
  
  // 移除扩展名
  let pathWithoutExt = relativePath.replace(/\.(ts|tsx|js|jsx)$/, '')
  
  // 添加各种可能的导入格式
  imports.push(pathWithoutExt)
  imports.push(`@/${pathWithoutExt}`)
  imports.push(`./${pathWithoutExt}`)
  imports.push(`../${pathWithoutExt}`)
  
  // 添加文件名（不带路径）
  const fileName = path.basename(pathWithoutExt)
  imports.push(fileName)
  imports.push(`./${fileName}`)
  
  // 添加目录名
  const dirName = path.dirname(pathWithoutExt)
  if (dirName !== '.') {
    imports.push(dirName)
  }
  
  return imports
}

// 分析页面
function analyzePages(projectRoot: string, allFiles: string[]): { used: string[], unused: string[] } {
  const pagesDir = path.join(projectRoot, 'app')
  const pageFiles: string[] = []
  
  // 查找所有 page.tsx 文件
  function findPageFiles(dir: string) {
    const files = fs.readdirSync(dir)
    files.forEach(file => {
      const filePath = path.join(dir, file)
      const stat = fs.statSync(filePath)
      
      if (stat.isDirectory()) {
        findPageFiles(filePath)
      } else if (file === 'page.tsx' || file === 'page.ts') {
        pageFiles.push(filePath)
      }
    })
  }
  
  if (fs.existsSync(pagesDir)) {
    findPageFiles(pagesDir)
  }
  
  const used: string[] = []
  const unused: string[] = []
  
  pageFiles.forEach(pageFile => {
    // 检查页面是否在路由中被引用（通过 Next.js 路由系统）
    // 对于 Next.js，所有 page.tsx 文件都是自动路由的，所以需要检查是否有导航链接
    const relativePath = path.relative(projectRoot, pageFile)
    const routePath = relativePath
      .replace(/^app\//, '/')
      .replace(/\/page\.(tsx|ts)$/, '')
      .replace(/\/\([^)]+\)\//g, '/') // 移除路由组
    
    // 检查是否有导航链接指向这个路由
    let isReferenced = false
    
    // 检查 layout.tsx 或其他文件中的导航
    for (const file of allFiles) {
      if (file === pageFile) continue
      
      try {
        const content = fs.readFileSync(file, 'utf-8')
        
        // 检查是否有 router.push, Link, href 等引用这个路由
        if (
          content.includes(`"${routePath}"`) ||
          content.includes(`'${routePath}'`) ||
          content.includes(`\`${routePath}\``) ||
          content.includes(`href="${routePath}"`) ||
          content.includes(`href='${routePath}'`) ||
          content.includes(`push("${routePath}"`) ||
          content.includes(`push('${routePath}'`) ||
          content.includes(`to="${routePath}"`) ||
          content.includes(`to='${routePath}'`)
        ) {
          isReferenced = true
          break
        }
      } catch (error) {
        // 忽略错误
      }
    }
    
    // 根页面和登录页面通常是入口，认为是被使用的
    if (routePath === '/' || routePath === '/login' || routePath === '/dashboard') {
      isReferenced = true
    }
    
    if (isReferenced) {
      used.push(relativePath)
    } else {
      unused.push(relativePath)
    }
  })
  
  return { used, unused }
}

// 分析 API 路由
function analyzeApiRoutes(projectRoot: string, allFiles: string[]): { used: string[], unused: string[] } {
  const apiDir = path.join(projectRoot, 'app', 'api')
  const routeFiles: string[] = []
  
  function findRouteFiles(dir: string) {
    if (!fs.existsSync(dir)) return
    
    const files = fs.readdirSync(dir)
    files.forEach(file => {
      const filePath = path.join(dir, file)
      const stat = fs.statSync(filePath)
      
      if (stat.isDirectory()) {
        findRouteFiles(filePath)
      } else if (file === 'route.ts' || file === 'route.tsx') {
        routeFiles.push(filePath)
      }
    })
  }
  
  findRouteFiles(apiDir)
  
  const used: string[] = []
  const unused: string[] = []
  
  routeFiles.forEach(routeFile => {
    const relativePath = path.relative(projectRoot, routeFile)
    // 从文件路径生成 API 路径
    // app/api/users/route.ts -> /api/users
    let apiPath = relativePath
      .replace(/^app\/api\//, '/api/')
      .replace(/\/route\.(ts|tsx)$/, '')
      .replace(/\[([^\]]+)\]/g, ':$1') // [id] -> :id
    
    // 检查 api-client.ts 或其他文件中是否有调用
    let isReferenced = false
    
    for (const file of allFiles) {
      if (file === routeFile) continue
      
      try {
        const content = fs.readFileSync(file, 'utf-8')
        
        // 检查是否有 fetch, apiClient 等调用这个 API
        if (
          content.includes(`"${apiPath}"`) ||
          content.includes(`'${apiPath}'`) ||
          content.includes(`\`${apiPath}\``) ||
          content.includes(`fetch("${apiPath}"`) ||
          content.includes(`fetch('${apiPath}'`) ||
          content.includes(`request("${apiPath}"`) ||
          content.includes(`request('${apiPath}'`)
        ) {
          isReferenced = true
          break
        }
      } catch (error) {
        // 忽略错误
      }
    }
    
    if (isReferenced) {
      used.push(relativePath)
    } else {
      unused.push(relativePath)
    }
  })
  
  return { used, unused }
}

// 分析组件
function analyzeComponents(projectRoot: string, allFiles: string[]): { used: string[], unused: string[] } {
  const componentsDir = path.join(projectRoot, 'components')
  if (!fs.existsSync(componentsDir)) {
    return { used: [], unused: [] }
  }
  
  const componentFiles = getAllFiles(componentsDir)
  const used: string[] = []
  const unused: string[] = []
  
  componentFiles.forEach(componentFile => {
    const relativePath = path.relative(projectRoot, componentFile)
    const isUsed = isFileReferenced(componentFile, allFiles, projectRoot)
    
    if (isUsed) {
      used.push(relativePath)
    } else {
      unused.push(relativePath)
    }
  })
  
  return { used, unused }
}

// 分析库文件
function analyzeLibFiles(projectRoot: string, allFiles: string[]): { used: string[], unused: string[] } {
  const libDir = path.join(projectRoot, 'lib')
  if (!fs.existsSync(libDir)) {
    return { used: [], unused: [] }
  }
  
  const libFiles = getAllFiles(libDir)
  const used: string[] = []
  const unused: string[] = []
  
  libFiles.forEach(libFile => {
    const relativePath = path.relative(projectRoot, libFile)
    const isUsed = isFileReferenced(libFile, allFiles, projectRoot)
    
    if (isUsed) {
      used.push(relativePath)
    } else {
      unused.push(relativePath)
    }
  })
  
  return { used, unused }
}

// 主函数
function main() {
  const projectRoot = process.cwd()
  console.log('🔍 开始分析未使用的代码...\n')
  console.log(`项目根目录: ${projectRoot}\n`)
  
  // 获取所有文件
  const allFiles = getAllFiles(projectRoot)
  console.log(`📁 找到 ${allFiles.length} 个文件\n`)
  
  // 分析各个部分
  console.log('📄 分析页面...')
  const pages = analyzePages(projectRoot, allFiles)
  
  console.log('🔌 分析 API 路由...')
  const apiRoutes = analyzeApiRoutes(projectRoot, allFiles)
  
  console.log('🧩 分析组件...')
  const components = analyzeComponents(projectRoot, allFiles)
  
  console.log('📚 分析库文件...')
  const libFiles = analyzeLibFiles(projectRoot, allFiles)
  
  // 输出结果
  console.log('\n' + '='.repeat(80))
  console.log('📊 分析结果')
  console.log('='.repeat(80) + '\n')
  
  // 页面
  console.log('📄 页面 (Pages)')
  console.log(`   ✅ 已使用: ${pages.used.length}`)
  console.log(`   ❌ 未使用: ${pages.unused.length}`)
  if (pages.unused.length > 0) {
    console.log('\n   未使用的页面:')
    pages.unused.forEach(page => {
      console.log(`   - ${page}`)
    })
  }
  console.log()
  
  // API 路由
  console.log('🔌 API 路由 (API Routes)')
  console.log(`   ✅ 已使用: ${apiRoutes.used.length}`)
  console.log(`   ❌ 未使用: ${apiRoutes.unused.length}`)
  if (apiRoutes.unused.length > 0) {
    console.log('\n   未使用的 API 路由:')
    apiRoutes.unused.forEach(route => {
      console.log(`   - ${route}`)
    })
  }
  console.log()
  
  // 组件
  console.log('🧩 组件 (Components)')
  console.log(`   ✅ 已使用: ${components.used.length}`)
  console.log(`   ❌ 未使用: ${components.unused.length}`)
  if (components.unused.length > 0) {
    console.log('\n   未使用的组件:')
    components.unused.forEach(component => {
      console.log(`   - ${component}`)
    })
  }
  console.log()
  
  // 库文件
  console.log('📚 库文件 (Lib Files)')
  console.log(`   ✅ 已使用: ${libFiles.used.length}`)
  console.log(`   ❌ 未使用: ${libFiles.unused.length}`)
  if (libFiles.unused.length > 0) {
    console.log('\n   未使用的库文件:')
    libFiles.unused.forEach(libFile => {
      console.log(`   - ${libFile}`)
    })
  }
  console.log()
  
  // 总结
  const totalUnused = 
    pages.unused.length + 
    apiRoutes.unused.length + 
    components.unused.length + 
    libFiles.unused.length
  
  console.log('='.repeat(80))
  console.log(`📈 总计: ${totalUnused} 个未使用的文件`)
  console.log('='.repeat(80))
  
  // 保存结果到文件
  const result: AnalysisResult = {
    pages,
    apiRoutes,
    components,
    libFiles,
  }
  
  const outputPath = path.join(projectRoot, 'unused-code-analysis.json')
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8')
  console.log(`\n💾 详细结果已保存到: ${outputPath}`)
}

main()
