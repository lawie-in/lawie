import { Options } from 'swagger-jsdoc';

export const swaggerOptions: Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Lawie API',
      version: '1.0.0',
      description: 'Lawie Legal Tech Platform — REST API Documentation',
      contact: {
        name: 'Lawie Team',
        email: 'dev@lawie.com',
      },
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:5000',
        description: 'Development Server',
      },
      {
        url: 'https://api.staging.lawie.com',
        description: 'Staging Server',
      },
      {
        url: 'https://api.lawie.com',
        description: 'Production Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/**/*.ts', './src/controllers/**/*.ts'],
};
