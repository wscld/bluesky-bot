[![Post to Bluesky](https://github.com/wscld/bluesky-bot/actions/workflows/post.yml/badge.svg)](https://github.com/wscld/bluesky-bot/actions/workflows/post.yml)

# Bot Automation Project

This project is a bot that integrates with Bluesky, Supabase, and OpenAI to automatically respond to mentions using AI-generated content. The bot detects when it is mentioned, generates a relevant response using OpenAI, and replies to the original post on Bluesky. Additionally, it tracks which posts it has already replied to using a Supabase database.

## Features

- **Bluesky API Integration**: Uses the Bluesky API to authenticate, fetch notifications (mentions), and post responses.
- **OpenAI Integration**: Automatically generates responses to mentioned posts using OpenAI's GPT-4 model.
- **Supabase Integration**: Tracks which posts the bot has already responded to, avoiding duplicate replies.
- **AI-Generated Responses**: Provides concise AI-generated responses based on the context of the mention.

## Installation

1. Clone this repository:

   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```

2. Install the dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file with the following environment variables:

   ```bash
   OPENAI_API_KEY=your_openai_api_key
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_key
   BSKY_HANDLE=your_bsky_handle
   BSKY_PASSWORD=your_bsky_password
   BOT_NAME=your_bot_name
   ```

## Usage

1. Run the bot locally:

   ```bash
   node index.js
   ```

2. The bot will authenticate with Bluesky, fetch mentions, generate AI responses, and post replies.

## Creating the Supabase Table

To track which posts the bot has replied to, you'll need to create a table in Supabase or PostgreSQL. The table will store the URIs of the posts that the bot has replied to, preventing it from responding to the same post more than once.

Here is the SQL to create the table:

```sql
CREATE TABLE bot_replies (
  id SERIAL PRIMARY KEY,
  bot_name TEXT NOT NULL,
  uri TEXT UNIQUE NOT NULL,
  replied_at TIMESTAMPTZ DEFAULT NOW()
);
```

- **`bot_name`**: The name of the bot, so you can track multiple bots if needed.
- **`uri`**: The unique identifier of the post the bot replied to.
- **`replied_at`**: A timestamp indicating when the bot replied to the post. Defaults to the current time when the row is inserted.

### Inserting Data

Whenever the bot replies to a post, it will use the `saveRepliedPost` function to insert a new row into this table, ensuring that the same post is not replied to multiple times.

## Project Structure

- **`getRepliedPosts`**: Fetches posts from Supabase that the bot has already replied to.
- **`saveRepliedPost`**: Saves the URI of a post the bot has responded to, preventing duplicate replies.
- **`generateAIResponse`**: Uses OpenAI to generate a response to the post text and (optionally) an image.
- **`doAuth`**: Authenticates the bot with Bluesky using the credentials provided in the `.env` file.
- **`getMentions`**: Fetches notifications where the bot is mentioned and filters out the ones it's already replied to.
- **`postContent`**: Posts the generated response back to Bluesky as a reply.

## Dependencies

- **`@atproto/api`**: For interacting with the Bluesky API.
- **`OpenAI`**: For generating AI responses.
- **`Supabase`**: For tracking bot activity and storing post URIs.
- **`zod`**: For environment variable validation.

## Contributing

1. Fork the repository
2. Create a new branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -am 'Add some feature'`)
4. Push the branch (`git push origin feature/your-feature`)
5. Create a new Pull Request

## License

This project is licensed under the MIT License.

---

Let me know if you need any further customizations!
