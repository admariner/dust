import { ChatBubbleBottomCenterTextIcon, PageHeader } from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";

import Conversation from "@app/components/assistant/conversation/Conversation";
import AssistantInputBar from "@app/components/assistant/InputBar";
import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationLab } from "@app/components/sparkle/navigation";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { MentionType } from "@app/types/assistant/conversation";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType;
  owner: WorkspaceType;
  gaTrackingId: string;
  conversationId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  if (!owner || !auth.isUser() || !user) {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }

  return {
    props: {
      user,
      owner,
      gaTrackingId: GA_TRACKING_ID,
      conversationId: context.params?.cId as string,
    },
  };
};

export default function AssistantConversation({
  user,
  owner,
  gaTrackingId,
  conversationId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const handleSubmit = async (input: string, mentions: MentionType[]) => {
    // Create a new user message.
    const mRes = await fetch(
      `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: input,
          context: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            profilePictureUrl: user.image,
          },
          mentions,
        }),
      }
    );

    if (!mRes.ok) {
      const data = await mRes.json();
      window.alert(`Error creating message: ${data.error.message}`);
      return;
    }
  };

  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="lab"
      subNavigation={subNavigationLab({ owner, current: "assistant" })}
    >
      <PageHeader
        title="Welcome to Assistant"
        icon={ChatBubbleBottomCenterTextIcon}
      />
      <Conversation owner={owner} conversationId={conversationId} />
      <div className="fixed bottom-0 left-0 right-0 z-20 flex-initial lg:left-80">
        <div className="mx-auto max-w-4xl pb-8">
          <AssistantInputBar onSubmit={handleSubmit} />
        </div>
      </div>
    </AppLayout>
  );
}
