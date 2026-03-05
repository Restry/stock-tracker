# Vercel Deployment Instructions

## Environment Variables Configuration

When deploying this application to Vercel, you **must** configure the following environment variables in your Vercel project settings:

### Required Environment Variables

1. **NEXT_PUBLIC_SUPABASE_URL**
   - Value: `https://db.dora.restry.cn`
   - Description: The URL of your Supabase instance

2. **NEXT_PUBLIC_SUPABASE_ANON_KEY**
   - Value: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE`
   - Description: The public/anonymous key for Supabase authentication

3. **SUPABASE_SERVICE_KEY**
   - Value: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q`
   - Description: The service role key for server-side database operations (keep this secret!)

### Optional Environment Variables

These are optional and only needed if you're using the AI decision engine and news features:

- **DEEPSEEK_API_KEY**: Your DeepSeek API key for AI-powered trading decisions
- **TAVILY_API_KEY**: Your Tavily API key for news/search enrichment
- **CRON_SECRET**: Secret token for securing cron job endpoints

## How to Configure in Vercel

### Option 1: Via Vercel Dashboard

1. Go to your project in the Vercel dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add each environment variable listed above
4. Set the environment to **Production**, **Preview**, and **Development** (or as needed)
5. Save the changes
6. Redeploy your application

### Option 2: Via Vercel CLI

If you're using the Vercel CLI, you can set environment variables using:

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_KEY production
```

You'll be prompted to enter the values for each variable.

### Option 3: Automatic Import from .env

You can also create a `.env.production` file locally and import it:

```bash
vercel env pull
```

## Deployment Steps

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy**:
   ```bash
   vercel --prod
   ```

   Or simply push to your Git repository if you have automatic deployments enabled.

## Verifying the Deployment

After deployment:

1. Visit your deployed application URL
2. Check that data loads correctly from the database
3. Verify that holdings, trades, and other data are displayed
4. Check the browser console for any error messages

## Troubleshooting

### Data Not Loading

If data is not loading after deployment:

1. **Check Environment Variables**: Ensure all three Supabase environment variables are set correctly in Vercel
2. **Check Build Logs**: Look for any errors in the Vercel build logs
3. **Check Runtime Logs**: Check the Vercel function logs for API errors
4. **Verify Database Connection**: Ensure the Supabase instance at `https://db.dora.restry.cn` is accessible

### 401 Unauthorized Errors

If you see 401 errors:
- Verify that the `SUPABASE_SERVICE_KEY` is set correctly
- Check that the key hasn't expired (though the provided keys expire in 2026)

### Database Connection Errors

The application is configured to use the Supabase REST API endpoint. If you experience connection issues:
- Verify the Supabase URL is correct
- Ensure the `/pg/query` endpoint is available on your Supabase instance
- Check Supabase instance logs for any errors
