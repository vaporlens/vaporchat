import { StyleSheet, Text } from 'react-native';
import type { SteamEvent } from 'vaporchat/protocol';
import { DetailPage } from '../components/DetailPage';
import { RichText } from '../components/RichText';
import { fullDate } from '../format';
import { colors } from '../theme';

/** A whole news post: its picture, title and text. */
export function ArticleScreen({
  event,
  onBack,
  onOpenImage,
}: {
  event: SteamEvent;
  onBack: () => void;
  onOpenImage: (url: string) => void;
}) {
  return (
    <DetailPage
      title={event.game ?? 'News'}
      subtitle={fullDate(event.startsAt)}
      steamUrl={event.url}
      onBack={onBack}
      imageUrl={event.imageUrl}
      imageRatio={16 / 9}
    >
      <Text style={styles.title}>{event.title}</Text>
      <RichText blocks={event.body} onOpenImage={onOpenImage} />
    </DetailPage>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.bright, fontSize: 22, fontWeight: '800' },
});
