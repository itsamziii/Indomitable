import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: ['docs/', 'dist/', 'node_modules/']
    },
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tseslint.parser
        },
        rules: {
            'indent': ['error', 4, { SwitchCase: 1 }],
            'quotes': ['error', 'single'],
            'brace-style': ['error', '1tbs'],
            'array-bracket-spacing': ['error', 'always'],
            'block-spacing': ['error', 'always'],
            'arrow-spacing': 'error',
            'switch-colon-spacing': ['error', { after: true, before: false }],
            'camelcase': 'off',
            'require-await': 'error'
        }
    }
);
