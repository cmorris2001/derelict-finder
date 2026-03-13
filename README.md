🏚️ Derelict Connect

A full-stack GenAI platform mapping, cataloguing, and reimagining Ireland's derelict property crisis — one AI renovation at a time.

Live on vercel: https://derelict-connect.vercel.app/ |  Built solo by Christopher Morris — final year BSc Business Information Systems student at UCC, U.S. citizen relocating April 2026.

🌍 The Problem
Ireland is facing a severe derelict property crisis. Thousands of abandoned buildings sit idle across the country while a housing shortage deepens. Derelict Connect makes this invisible problem visible — and gives people a tool to reimagine what these spaces could become.

✨ Features
🗺️ Interactive Property Map

Browse derelict properties across Ireland on a live geospatial map powered by React Leaflet
Upload photos and data for derelict properties in your area
View detailed property information including location, condition, and community submissions

🤖 AI Renovation Generator

Upload a photo of any derelict property and generate a realistic AI renovation using the Replicate API
Visualise what the building could look like after restoration — instantly

📱 Social Feed

Share your AI-generated renovations with the community
React and engage with reimaginations submitted by other users
A living, growing archive of Ireland's derelict buildings and their potential

🏆 Leaderboard

Sign up via Magic Link authentication (no password needed)
Earn your place on the leaderboard by submitting the most derelict properties
Gamified community-driven data collection


🛠️ Tech Stack
LayerTechnologyFrontendReact, React LeafletBackend/DatabaseSupabase (PostgreSQL)AI Image GenerationReplicate APIAuthSupabase Magic LinkDeploymentVercel

🗄️ Database Design

Relational schema built in PostgreSQL via Supabase
Complex SQL queries support map rendering, property filtering, feed ordering, and leaderboard ranking
Real-time capabilities via Supabase's live API
