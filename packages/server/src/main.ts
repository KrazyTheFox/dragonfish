import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config, DotenvConfigOutput } from 'dotenv';
import * as cookieParser from 'cookie-parser';
import { json, urlencoded } from 'body-parser';
import * as csurf from 'csurf';
import * as helmet from 'helmet';

import { AppModule } from './app/app.module';

/**
 * Determines the location of the required .env file.
 */
const results: DotenvConfigOutput = config();
if (results.error) {
  console.log(`You don't have a .env file set up! Are you sure the environment variables are configured?`);
}

/**
 * Determines whether we're in a local, test, or production environment based on
 * DEV_ENV stored in environment variables.
 */
async function determineEnv(): Promise<string> {
    if (process.env.DEV_ENV === 'local') {
        return `http://localhost:4200/`
    } else if (process.env.DEV_ENV === 'staging') {
        return process.env.STAGING_ORIGIN;
    } else if (process.env.DEV_ENV === 'production') {
        return process.env.PRODUCTION_ORIGIN;
    }
}

/**
 * Bootstraps the web server.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.use(json({limit: '50mb'}));
  app.use(urlencoded({limit: '50mb', extended: true}));
  app.use(csurf({cookie: true}));
  app.use(function (req, res, next) {
    res.cookie('XSRF-TOKEN', req.csrfToken()); // this is to make sure the XSRF-TOKEN is being set correctly
    return next();
  });
  app.use(helmet());
  app.enableCors({origin: await determineEnv(), credentials: true});
  app.use(require('prerender-node').set('prerenderToken', process.env.PRERENDER_TOKEN));
  const port = process.env.PORT || 3333;
  await app.listen(port, () => {
    Logger.log('Listening at http://localhost:' + port + '/');
  });
}

bootstrap();
