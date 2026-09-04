<?xml version="1.0" encoding="utf-8"?>
<!--
  Allplan-PythonPart "Wand bewehren" · HSD Hamburg GmbH
  Palette zur Eingabe der Wandmaße und der Bewehrungsvorgaben.
  Durchmesser und Abstände mit 0 bedeuten: automatisch nach
  DIN EN 1992-1-1 Abs. 9.6 wählen.
-->
<Element>
    <Script>
        <Name>HSD\WandBewehrung.py</Name>
        <Title>Wand bewehren</Title>
        <Version>1.0</Version>
    </Script>

    <Page>
        <Name>Wand</Name>
        <Text>Wand</Text>

        <Parameter>
            <Name>Abmessungen</Name>
            <Text>Abmessungen</Text>
            <ValueType>Expander</ValueType>

            <Parameter>
                <Name>Laenge</Name>
                <Text>Wandlänge</Text>
                <Value>5000.0</Value>
                <MinValue>500.0</MinValue>
                <ValueType>Length</ValueType>
            </Parameter>
            <Parameter>
                <Name>Hoehe</Name>
                <Text>Wandhöhe</Text>
                <Value>2750.0</Value>
                <MinValue>500.0</MinValue>
                <ValueType>Length</ValueType>
            </Parameter>
            <Parameter>
                <Name>Dicke</Name>
                <Text>Wanddicke</Text>
                <Value>240.0</Value>
                <MinValue>100.0</MinValue>
                <ValueType>Length</ValueType>
            </Parameter>
        </Parameter>

        <Parameter>
            <Name>Beton</Name>
            <Text>Beton und Betondeckung</Text>
            <ValueType>Expander</ValueType>

            <Parameter>
                <Name>Betonguete</Name>
                <Text>Festigkeitsklasse</Text>
                <Value>C25/30</Value>
                <ValueList>C20/25|C25/30|C30/37|C35/45</ValueList>
                <ValueType>StringComboBox</ValueType>
            </Parameter>
            <Parameter>
                <Name>Betondeckung</Name>
                <Text>Betondeckung c_nom [mm]</Text>
                <Value>25.0</Value>
                <MinValue>10.0</MinValue>
                <MaxValue>90.0</MaxValue>
                <ValueType>Double</ValueType>
            </Parameter>
        </Parameter>

        <Parameter>
            <Name>Bewehrung</Name>
            <Text>Bewehrung (0 = automatisch nach Abs. 9.6)</Text>
            <ValueType>Expander</ValueType>

            <Parameter>
                <Name>DsLotrecht</Name>
                <Text>⌀ lotrecht [mm]</Text>
                <Value>0</Value>
                <ValueList>0|8|10|12|14|16</ValueList>
                <ValueType>IntegerComboBox</ValueType>
            </Parameter>
            <Parameter>
                <Name>AbstandLotrecht</Name>
                <Text>Abstand lotrecht [mm]</Text>
                <Value>0.0</Value>
                <MinValue>0.0</MinValue>
                <MaxValue>400.0</MaxValue>
                <ValueType>Double</ValueType>
            </Parameter>
            <Parameter>
                <Name>DsWaagerecht</Name>
                <Text>⌀ waagerecht [mm]</Text>
                <Value>0</Value>
                <ValueList>0|8|10|12|14|16</ValueList>
                <ValueType>IntegerComboBox</ValueType>
            </Parameter>
            <Parameter>
                <Name>AbstandWaagerecht</Name>
                <Text>Abstand waagerecht [mm]</Text>
                <Value>0.0</Value>
                <MinValue>0.0</MinValue>
                <MaxValue>400.0</MaxValue>
                <ValueType>Double</ValueType>
            </Parameter>
        </Parameter>

        <Parameter>
            <Name>Anschluss</Name>
            <Text>Stoß und Anschluss</Text>
            <ValueType>Expander</ValueType>

            <Parameter>
                <Name>Stossfaktor</Name>
                <Text>Übergreifung l0 = x · d_s</Text>
                <Value>50.0</Value>
                <MinValue>10.0</MinValue>
                <MaxValue>100.0</MaxValue>
                <ValueType>Double</ValueType>
            </Parameter>
            <Parameter>
                <Name>VerankerungUnten</Name>
                <Text>Anschlusslänge unten [mm]</Text>
                <Value>0.0</Value>
                <MinValue>0.0</MinValue>
                <ValueType>Length</ValueType>
            </Parameter>
        </Parameter>

        <Parameter>
            <Name>HinweisTrenner</Name>
            <Text> </Text>
            <ValueType>Separator</ValueType>
        </Parameter>
        <Parameter>
            <Name>Hinweis</Name>
            <Text>Konstruktive Mindestbewehrung nach DIN EN 1992-1-1 Abschnitt 9.6 – keine Bemessung.</Text>
            <ValueType>Text</ValueType>
        </Parameter>
    </Page>
</Element>
