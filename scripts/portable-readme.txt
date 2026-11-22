NexaSpec Insight Portable {{VERSION}}
====================================

【起動方法】
ZIPを書き込み可能なフォルダーに展開し、NexaSpec-Insight-Portable-{{VERSION}}.exe をダブルクリックしてください。
DLL、resources、localesなどの追加ファイルは不要です。

【PortableDataの場所】
初回起動時に、EXEと同じ場所へ次のフォルダーが自動作成されます。

NexaSpec-Insight-PortableData

ElectronのuserData、sessionData、設定、ログ、キャッシュ、一時ファイルは、
このPortableDataフォルダー内へ保存されます。
旧版から更新する場合は、同じ場所にある PC-Spec-Tool-PortableData が引き続き使われます。

【別の場所へ移動する方法】
1. NexaSpec Insightを終了します。
2. 設定やデータも引き継ぐ場合は、EXEとPortableDataフォルダーを一緒に移動します。
3. EXEだけを移動した場合は、次回起動時に移動先のEXEの隣へ新しいPortableDataが作成されます。

【削除方法】
NexaSpec Insightを終了してから、次の2つを削除してください。

- NexaSpec-Insight-Portable-{{VERSION}}.exe
- NexaSpec-Insight-PortableData（旧版から更新した場合は PC-Spec-Tool-PortableData）

レジストリへのインストール情報やアンインストール操作はありません。
