module.exports = {
  // Basic formatting
  printWidth: 120,
  tabWidth: 2,
  useTabs: false,
  semi: false,
  singleQuote: true,
  quoteProps: 'as-needed',
  trailingComma: 'es5',
  bracketSpacing: true,
  bracketSameLine: false,
  arrowParens: 'avoid',
  endOfLine: 'lf',

  // Language-specific formatting
  overrides: [
    {
      files: '*.json',
      options: {
        printWidth: 80,
        tabWidth: 2,
      },
    },
    {
      files: '*.md',
      options: {
        printWidth: 80,
        proseWrap: 'always',
        tabWidth: 2,
      },
    },
    {
      files: '*.yml',
      options: {
        printWidth: 80,
        tabWidth: 2,
      },
    },
    {
      files: '*.yaml',
      options: {
        printWidth: 80,
        tabWidth: 2,
      },
    },
    {
      files: ['*.ts', '*.tsx'],
      options: {
        parser: 'typescript',
        printWidth: 120,
        tabWidth: 2,
        semi: false,
        singleQuote: true,
        trailingComma: 'es5',
        bracketSpacing: true,
        arrowParens: 'avoid',
      },
    },
    {
      files: ['*.js', '*.jsx'],
      options: {
        parser: 'babel',
        printWidth: 120,
        tabWidth: 2,
        semi: false,
        singleQuote: true,
        trailingComma: 'es5',
        bracketSpacing: true,
        arrowParens: 'avoid',
      },
    },
    {
      files: '*.css',
      options: {
        parser: 'css',
        printWidth: 120,
        tabWidth: 2,
        singleQuote: false,
      },
    },
    {
      files: '*.scss',
      options: {
        parser: 'scss',
        printWidth: 120,
        tabWidth: 2,
        singleQuote: false,
      },
    },
    {
      files: '*.html',
      options: {
        parser: 'html',
        printWidth: 120,
        tabWidth: 2,
        htmlWhitespaceSensitivity: 'css',
        bracketSameLine: false,
      },
    },
    {
      files: '*.prisma',
      options: {
        parser: 'prisma-parse',
        printWidth: 120,
        tabWidth: 2,
      },
    },
  ],

  // Plugin configurations
  plugins: [
    '@trivago/prettier-plugin-sort-imports',
    'prettier-plugin-tailwindcss',
    'prettier-plugin-prisma',
  ],

  // Import sorting
  importOrder: [
    '^react$',
    '^react-dom$',
    '^react/(.*)$',
    '^next/(.*)$',
    '<THIRD_PARTY_MODULES>',
    '^@/(.*)$',
    '^[./]',
  ],
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
  importOrderGroupNamespaceSpecifiers: true,
  importOrderCaseInsensitive: true,

  // Tailwind CSS
  tailwindConfig: './client/tailwind.config.js',
  tailwindFunctions: ['clsx', 'cn', 'cva'],
}