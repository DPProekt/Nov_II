import sys
import unittest
from pathlib import Path
from unittest.mock import Mock
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from session_manager import Manager, TOPICS, ApiError

class ReceiptTests(unittest.TestCase):
    def save(self, before, after):
        topic = 'Прогноз экономики при быстром развитии ИИ'
        doc = {'id': TOPICS[topic], 'messages': []}
        manager = Manager(None, None, None, 'example')
        manager.final_answer = Mock(return_value='Проверено')
        manager.read_file = Mock(side_effect=lambda path: (after, 'news-sha') if path == 'news.json' else ({'docs':[doc]},'archive-sha'))
        manager.write_file = Mock()
        manager.append_answer(topic, 's', {'id':'t'}, before)
        return doc['messages'][0]

    def test_counts_additions_for_the_topic_without_counting_duplicates_or_other_topics(self):
        n=lambda topic,url: dict(topic=topic,url=url)
        items=[n('Прогноз экономики ИИ','old'),n('Прогноз экономики ИИ','new'),n('Прогноз экономики ИИ','new'),n('Новости GPT','different')]
        self.assertEqual(self.save(['old'], {'items':items})['added_articles'],1)
        self.assertEqual(self.save(['old','new'], {'items':items})['added_articles'],0)

    def test_missing_or_corrupt_metadata_does_not_make_a_check_quiet(self):
        self.assertNotIn('added_articles', self.save(None, {'items':[]}))
        self.assertNotIn('added_articles', self.save(['old'], {}))
        manager=Manager(None,None,None,'test');manager.read_file=Mock(side_effect=ApiError('read', 503))
        self.assertIsNone(manager.topic_article_urls('Новости GPT'))

if __name__=='__main__':unittest.main()
