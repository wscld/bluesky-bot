import atproto from "@atproto/api";
import OpenAI from "openai";
import { env } from "node:process";
import { z } from "zod";
import { Notification } from "@atproto/api/dist/client/types/app/bsky/notification/listNotifications.js";
import { PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs.js";
import { createClient } from "@supabase/supabase-js";

const envSchema = z.object({
  BSKY_HANDLE: z.string().nonempty(),
  BSKY_PASSWORD: z.string().nonempty(),
  BSKY_SERVICE: z.string().nonempty().default("https://bsky.social"),
  BOT_NAME: z.string().nonempty().default("NO_NAME"),
  SUPABASE_URL: z.string().nonempty(),
  SUPABASE_KEY: z.string().nonempty(),
  OPENAI_API_KEY: z.string().nonempty(),
});

const parsed = envSchema.parse(env);

const client = new OpenAI({
  apiKey: parsed.OPENAI_API_KEY,
});

const botName = parsed.BOT_NAME;

const supabase = createClient(parsed.SUPABASE_URL, parsed.SUPABASE_KEY);

const getRepliedPosts = async (): Promise<
  {
    bot_name: string;
    uri: string;
  }[]
> => {
  const { data, error } = await supabase.from("bot_replies").select();
  if (data) {
    return data;
  }
  if (error) {
    console.error(error);
  }
};

const saveRepliedPost = async (postUri: string) => {
  const { error } = await supabase
    .from("bot_replies")
    .insert({ uri: postUri, bot_name: botName });

  if (error) {
    console.error(error);
  }
};

const generateAIResponse = async (text: string, image?: string) => {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 300,
    messages: [
      {
        role: "system",
        content: `Você é um desenvolvedor senior que response apenas perguntas relacionadas a programação e tecnologia. Você responde em no máximo 250 caracteres`,
      },
      {
        role: "user",
        content: image
          ? [
              {
                type: "text",
                text: text.replace(`@${parsed.BSKY_HANDLE}`, ""),
              },
              {
                type: "image_url",
                image_url: {
                  url: image,
                },
              },
            ]
          : [
              {
                type: "text",
                text: text.replace(`@${parsed.BSKY_HANDLE}`, ""),
              },
            ],
      },
    ],
  });

  return response.choices[0].message.content || ":(";
};

const splitText = async (text: string): Promise<{ parts: string[] }> => {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 300,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Você divide textos em partes, cada parte pode ter no máximo 200 caracteres e até 3 partes no máximo. Você retorna um json SEMPRE no formato { parts: string[] } com cada parte do texto`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: text.replace(`@${parsed.BSKY_HANDLE}`, ""),
          },
        ],
      },
    ],
  });

  return JSON.parse(response.choices[0].message.content);
};

const cacheSession = async (session: atproto.AtpSessionData) => {
  const { error } = await supabase
    .from("bot_cache_session")
    .upsert(
      { session: session, bot_name: botName, updated_at: new Date() },
      { onConflict: "bot_name" }
    );

  if (error) {
    console.error(error);
  }
};

const getCacheSession = async () => {
  const { data, error } = await supabase
    .from("bot_cache_session")
    .select()
    .eq("bot_name", botName);

  if (error) {
    console.error(error);
  }

  if (data) {
    return data[0];
  }
};

const doAuth = async () => {
  const agent = new atproto.BskyAgent({ service: "https://bsky.social/" });
  const cachedSession = await getCacheSession();
  if (cachedSession) {
    await agent.resumeSession(cachedSession.session);
  } else {
    await agent.login({
      identifier: parsed.BSKY_HANDLE,
      password: parsed.BSKY_PASSWORD,
    });
    await cacheSession(agent.session);
  }

  return agent;
};

const getMentions = async (
  agent: atproto.BskyAgent
): Promise<Notification[]> => {
  const alreadyReplied = await getRepliedPosts();

  const search = await agent.listNotifications();
  return search.data.notifications.filter(
    (n: Notification) =>
      n.reason === "mention" &&
      !alreadyReplied.map((r) => r.uri).includes(n.uri)
  );
};

const postContent = async (
  agent: atproto.BskyAgent,
  text: string,
  post: PostView
) => {
  if (text.length > 300) {
    const threadText = await splitText(text);
    if (threadText.parts) {
      postThread(agent, threadText.parts, post);
    }
  } else {
    console.log("replying in text format...", post.uri);
    await saveRepliedPost(post.uri);
    const rt = new atproto.RichText({ text: text });
    const postRecord = {
      $type: "app.bsky.feed.post",
      text: rt.text,
      facets: rt.facets,
      createdAt: new Date().toISOString(),
      reply: {
        root: { uri: post.uri, cid: post.cid },
        parent: { uri: post.uri, cid: post.cid },
      },
    };
    return await agent.post(postRecord);
  }
};

const postThread = async (
  agent: atproto.BskyAgent,
  texts: string[],
  post: PostView
) => {
  console.log("replying in thread format...", post.uri);
  await saveRepliedPost(post.uri);
  let prevPost = { uri: post.uri, cid: post.cid };
  texts?.forEach(async (text) => {
    const rt = new atproto.RichText({ text: text });
    const postRecord = {
      $type: "app.bsky.feed.post",
      text: rt.text,
      facets: rt.facets,
      createdAt: new Date().toISOString(),
      reply: {
        root: { uri: post.uri, cid: post.cid },
        parent: { uri: prevPost.uri, cid: prevPost.cid },
      },
    };
    prevPost = await agent.post(postRecord);
  });

  return prevPost;
};

const generatePost = async () => {
  const agent = await doAuth();

  const mentions = await getMentions(agent);
  if (mentions.length > 0) {
    const posts = await agent.getPosts({
      uris: mentions.map((m: Notification) => m.uri),
    });

    posts.data.posts.forEach(async (post: PostView) => {
      const image = post.embed?.images
        ? post.embed.images[0].fullsize
        : undefined;

      const text = await generateAIResponse(
        (post.record as { text: string }).text,
        image
      );
      await postContent(agent, text, post);
    });
  }
};

generatePost();
